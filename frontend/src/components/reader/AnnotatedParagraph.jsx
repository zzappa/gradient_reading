import { forwardRef, useCallback, useState } from 'react';
import TermSpan from './TermSpan';
import { speak, stop, isSupported } from '../../utils/speech';

// Supports both {{display|base}} and {{display|base|native_display}} formats
// Also tolerates malformed variants like {{display|}base}.
const ANNOTATION_RE = /\{\{([^|]+)\|\}?([^|}]+)(?:\|\}?([^}]*))?\}\}?/g;

function normalizeAnnotationToken(value) {
  return (value || '').trim().replace(/^[{}|]+|[{}|]+$/g, '');
}

function parseAnnotations(text) {
  const segments = [];
  let lastIndex = 0;

  for (const match of text.matchAll(ANNOTATION_RE)) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'term',
      display: match[1],
      key: normalizeAnnotationToken(match[2]),
      displayNative: normalizeAnnotationToken(match[3] || '') || null,
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}


const SpeakButton = ({ text, langCode, footnotesByKey }) => {
  const [playing, setPlaying] = useState(false);

  if (!isSupported()) return null;

  function handleClick(e) {
    e.stopPropagation();
    if (playing) {
      stop();
      setPlaying(false);
    } else {
      setPlaying(true);
      speak(text, langCode, {
        onEnd: () => setPlaying(false),
        footnotesByKey,
      });
    }
  }

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition-colors ${
        playing
          ? 'text-accent bg-accent/10'
          : 'text-text-muted/40 hover:text-accent hover:bg-accent/10'
      }`}
      title={playing ? 'Stop' : 'Listen'}
    >
      {playing ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      )}
    </button>
  );
};

const AnnotatedParagraph = forwardRef(function AnnotatedParagraph(
  {
    text,
    footnotesByKey,
    fontClass,
    onTermDoubleClick,
    langCode,
    sourceLangCode,
    level,
    focusedTermKey,
    forceNativeScript = false,
  },
  ref
) {
  const segments = parseAnnotations(text);

  // Use source language voice for levels 0-5 (mostly source text),
  // target language voice for levels 6-7 (mostly target text)
  const readAloudLang = level >= 6 ? langCode : sourceLangCode;

  // Double-click on plain text → grab selected word and open chat
  const handleParaDoubleClick = useCallback(
    () => {
      const selection = window.getSelection();
      const word = selection?.toString().trim();
      if (!word || word.includes(' ')) return;
      onTermDoubleClick?.({ display: word, termKey: word, footnote: null });
    },
    [onTermDoubleClick]
  );

  return (
    <div className="flex gap-2 mb-6 group/para">
      <p
        ref={ref}
        className={`font-serif ${fontClass} leading-[1.75] flex-1`}
        onDoubleClick={handleParaDoubleClick}
      >
        {segments.map((seg, i) =>
          seg.type === 'text' ? (
            <span key={i}>{seg.content}</span>
          ) : (
            <TermSpan
              key={i}
              display={seg.display}
              termKey={seg.key}
              displayNative={seg.displayNative}
              footnote={footnotesByKey[seg.key.toLowerCase()]}
              isNew={!!footnotesByKey[seg.key.toLowerCase()]}
              onDoubleClick={onTermDoubleClick}
              langCode={langCode}
              isFocused={focusedTermKey === seg.key.toLowerCase()}
              forceNativeScript={forceNativeScript}
            />
          )
        )}
      </p>
      <div className="pt-1.5 opacity-0 group-hover/para:opacity-100 transition-opacity">
        <SpeakButton text={text} langCode={readAloudLang} footnotesByKey={footnotesByKey} />
      </div>
    </div>
  );
});

export default AnnotatedParagraph;
