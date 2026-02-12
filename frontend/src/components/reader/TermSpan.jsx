import { useState, useRef, useCallback } from 'react';
import Tooltip from './Tooltip';
import { speakTerm, isSupported } from '../../utils/speech';

export default function TermSpan({
  display,
  termKey,
  displayNative,
  footnote,
  isNew,
  onDoubleClick,
  langCode,
  isFocused = false,
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showNative, setShowNative] = useState(false);
  const ref = useRef(null);
  const speakTimeout = useRef(null);

  // Prefer displayNative (contextual inflected form) over footnote.native_script (base form)
  const nativeScript = displayNative || footnote?.native_script;
  const hasNativeScript = nativeScript && nativeScript !== display;
  const displayText = showNative && hasNativeScript ? nativeScript : display;

  const handleMouseEnter = useCallback(() => {
    setShowTooltip(true);
    // Auto-speak after a short delay to avoid accidental triggers
    if (isNew && isSupported()) {
      speakTimeout.current = setTimeout(() => {
        // Pass native script so speakTerm can use target voice with native text
        // (instead of reading Latin transliteration with a Hebrew/Russian/etc voice)
        const native = displayNative || footnote?.native_script || null;
        speakTerm(display, langCode, native);
      }, 300);
    }
  }, [display, langCode, isNew, footnote, displayNative]);

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
    // Cancel pending speak timeout but let already-started speech finish
    // (single terms are short — interrupting them sounds broken)
    if (speakTimeout.current) {
      clearTimeout(speakTimeout.current);
      speakTimeout.current = null;
    }
  }, []);

  function handleClick() {
    if (hasNativeScript) {
      setShowNative((prev) => !prev);
    }
  }

  function handleDoubleClick(e) {
    e.stopPropagation();
    onDoubleClick?.({ display, termKey, footnote });
  }

  // New terms at this level: green highlight + tooltip on hover + auto-speak
  // Previously introduced terms: no highlight, just render inline
  if (!isNew) {
    return (
      <span
        onDoubleClick={handleDoubleClick}
        className={isFocused ? 'rounded px-0.5 ring-2 ring-accent/70 ring-offset-1 ring-offset-bg' : ''}
      >
        {display}
      </span>
    );
  }

  return (
    <span
      ref={ref}
      className={`text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/40 rounded px-0.5 transition-colors cursor-help hover:bg-emerald-100 dark:hover:bg-emerald-900/60 ${
        isFocused ? 'ring-2 ring-accent/70 ring-offset-1 ring-offset-bg' : ''
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {displayText}
      {showTooltip && footnote && (
        <Tooltip anchorRef={ref}>
          <div className="font-sans">
            <div className="text-sm font-medium text-text">
              {footnote.translation || termKey}
            </div>
            {footnote.pronunciation && (
              <div className="text-xs text-text-muted italic">
                /{footnote.pronunciation}/
              </div>
            )}
            {footnote.grammar_note && (
              <div className="text-xs text-text-muted mt-1 leading-snug">
                {footnote.grammar_note}
              </div>
            )}
            {hasNativeScript && !showNative && (
              <div className="text-xs text-accent mt-1">
                Click to show {nativeScript}
              </div>
            )}
          </div>
        </Tooltip>
      )}
    </span>
  );
}
