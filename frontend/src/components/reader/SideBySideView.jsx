import { useState, useEffect, useMemo } from 'react';
import { getChapter } from '../../api/client';
import AnnotatedParagraph from './AnnotatedParagraph';
import Spinner from '../ui/Spinner';

export default function SideBySideView({
  projectId,
  chapterNums,
  rightLevel,
  onRightLevelChange,
  project,
  fontClass,
  onTermDoubleClick,
  focusedTermKey,
  showNativeScript = false,
}) {
  const [originalChapter, setOriginalChapter] = useState(null);
  const [transformedChapter, setTransformedChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Right side is the transformed level (exclude 0 from selector)
  const transformedLevels = useMemo(
    () => chapterNums.filter((n) => n !== 0),
    [chapterNums]
  );

  useEffect(() => {
    if (!transformedLevels.length) {
      setError('No transformed chapters are available yet.');
      setLoading(false);
      return;
    }
    if (!transformedLevels.includes(rightLevel)) {
      onRightLevelChange(transformedLevels[0]);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      getChapter(projectId, 0),
      getChapter(projectId, rightLevel),
    ])
      .then(([orig, trans]) => {
        if (!active) return;
        setOriginalChapter(orig);
        setTransformedChapter(trans);
      })
      .catch(() => {
        if (!active) return;
        setError(`Could not load level ${rightLevel}.`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, rightLevel, transformedLevels, onRightLevelChange]);

  if (loading || !originalChapter || !transformedChapter) {
    return (
      <div className="flex justify-center py-16 px-6">
        {error ? (
          <p className="text-sm text-text-muted">{error}</p>
        ) : (
          <Spinner size="lg" />
        )}
      </div>
    );
  }

  // Original text (chapter 0) — the source chapter for this level
  // Since each level is a segment of the story, we show the corresponding
  // source paragraphs. The transformed chapter stores its source_text.
  const originalText = transformedChapter.source_text || originalChapter.content || '';
  const originalParas = originalText.split('\n\n').filter(Boolean);

  const transformedParas = transformedChapter.content?.split('\n\n').filter(Boolean) || [];
  const maxLen = Math.max(originalParas.length, transformedParas.length);

  const transformedFootnotes = {};
  (transformedChapter.footnotes || []).forEach((fn) => {
    const key = fn.term.toLowerCase();
    if (!transformedFootnotes[key]) transformedFootnotes[key] = fn;
  });

  const langCode = project?.target_language || 'en';
  const sourceLangCode = project?.source_language || 'en';

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8">
      {/* Header */}
      <div className="grid grid-cols-2 gap-8 mb-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Original</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted uppercase tracking-wider mr-2">Level:</span>
          <div className="flex gap-1">
            {transformedLevels.map((num) => (
              <button
                key={num}
                onClick={() => onRightLevelChange(num)}
                className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                  num === rightLevel
                    ? 'bg-accent text-white'
                    : 'bg-surface text-text-muted hover:text-text'
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Aligned paragraphs */}
      <div className="max-w-5xl mx-auto">
        {Array.from({ length: maxLen }, (_, i) => (
          <div key={i} className="grid grid-cols-2 gap-8 mb-2">
            <div>
              {originalParas[i] && (
                <p className={`font-serif ${fontClass} leading-[1.75] text-text-muted`}>
                  {originalParas[i]}
                </p>
              )}
            </div>
            <div>
              {transformedParas[i] && (
                <AnnotatedParagraph
                  text={transformedParas[i]}
                  footnotesByKey={transformedFootnotes}
                  fontClass={fontClass}
                  onTermDoubleClick={onTermDoubleClick}
                  langCode={langCode}
                  sourceLangCode={sourceLangCode}
                  level={rightLevel}
                  focusedTermKey={focusedTermKey}
                  forceNativeScript={showNativeScript && rightLevel >= 6}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
