import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getProject, getChapters, getChapter, getExportUrl } from '../api/client';
import { useUser } from '../context/UserContext';
import { levelToCefr } from '../utils/cefr';
import {
  buildSubstitutionData,
  createFlashcardFromTerm,
  upsertFlashcard,
} from '../utils/flashcards';
import Flag from '../components/ui/Flag';
import AnnotatedParagraph from '../components/reader/AnnotatedParagraph';
import ReaderChat from '../components/reader/ReaderChat';
import SideBySideView from '../components/reader/SideBySideView';
import ComprehensionQuiz from '../components/reader/ComprehensionQuiz';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import { speak, stop, isSupported as speechSupported } from '../utils/speech';
import { LANGUAGES } from '../languages';

const FONT_SIZES = [
  { label: 'A', class: 'text-base', value: 'sm' },
  { label: 'A', class: 'text-lg', value: 'md' },
  { label: 'A', class: 'text-xl', value: 'lg' },
];

function getReadKey(projectId) {
  return `gradient_read_${projectId}`;
}

function getReaderStateKey(projectId) {
  return `gradient_reader_state_${projectId}`;
}

function getReadChapters(projectId) {
  try {
    return JSON.parse(localStorage.getItem(getReadKey(projectId)) || '[]');
  } catch {
    return [];
  }
}

function setReadChapters(projectId, nums) {
  localStorage.setItem(getReadKey(projectId), JSON.stringify(nums));
}

function getReaderState(projectId) {
  try {
    const raw = localStorage.getItem(getReaderStateKey(projectId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function setReaderState(projectId, patch) {
  const prev = getReaderState(projectId);
  const next = {
    ...prev,
    ...patch,
    scrollByChapter: {
      ...(prev.scrollByChapter || {}),
      ...(patch.scrollByChapter || {}),
    },
  };
  localStorage.setItem(getReaderStateKey(projectId), JSON.stringify(next));
}

export default function Reader() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [searchParams] = useSearchParams();
  const chapterQuery = searchParams.get('chapter');
  const termQuery = searchParams.get('term');
  const [project, setProject] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [currentNum, setCurrentNum] = useState(0);
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fontSize, setFontSize] = useState('md');
  const [readChapters, setReadState] = useState([]);
  const [notesOpen, setNotesOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInitialMessage, setChatInitialMessage] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [listening, setListening] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [sideBySide, setSideBySide] = useState(false);
  const [rightLevel, setRightLevel] = useState(1);
  const [showNativeScript, setShowNativeScript] = useState(false);
  const [focusedTermKey, setFocusedTermKey] = useState(null);
  const [cardFeedback, setCardFeedback] = useState({});
  const textPanelRef = useRef(null);
  const footnotePanelRef = useRef(null);
  const restoreScrollRef = useRef(null);
  const scrollSaveTimerRef = useRef(null);

  useEffect(() => {
    const savedState = getReaderState(projectId);
    const hasDeepLink = Boolean(chapterQuery || termQuery);
    if (savedState.fontSize) setFontSize(savedState.fontSize);
    if (typeof savedState.notesOpen === 'boolean') setNotesOpen(hasDeepLink ? true : savedState.notesOpen);
    if (typeof savedState.sideBySide === 'boolean') setSideBySide(hasDeepLink ? false : savedState.sideBySide);
    if (typeof savedState.rightLevel === 'number') setRightLevel(savedState.rightLevel);
    if (typeof savedState.showNativeScript === 'boolean') setShowNativeScript(savedState.showNativeScript);
    if (typeof termQuery === 'string' && termQuery.trim()) {
      setFocusedTermKey(termQuery.toLowerCase());
    } else {
      setFocusedTermKey(null);
    }

    Promise.all([getProject(projectId), getChapters(projectId)])
      .then(([proj, chs]) => {
        setProject(proj);
        const sorted = [...chs].sort((a, b) => a.chapter_num - b.chapter_num);
        setChapters(sorted);
        if (sorted.length > 0) {
          const nums = sorted.map((c) => c.chapter_num);
          const chapterFromQuery = Number.parseInt(chapterQuery || '', 10);
          const hasQueryChapter = Number.isFinite(chapterFromQuery) && nums.includes(chapterFromQuery);
          const hasSavedChapter =
            typeof savedState.currentNum === 'number' && nums.includes(savedState.currentNum);

          const initialChapter = hasQueryChapter
            ? chapterFromQuery
            : (hasSavedChapter ? savedState.currentNum : sorted[0].chapter_num);

          setCurrentNum(initialChapter);
          const savedScroll = savedState.scrollByChapter?.[initialChapter];
          restoreScrollRef.current = typeof savedScroll === 'number' ? savedScroll : null;

          if (savedState.sideBySide && typeof savedState.rightLevel !== 'number') {
            const transformedLevels = nums.filter((n) => n !== 0);
            if (transformedLevels.length) {
              setRightLevel(transformedLevels.includes(initialChapter) ? initialChapter : transformedLevels[0]);
            }
          }
        }
        setReadState(getReadChapters(projectId));
      })
      .catch((err) => {
        console.error('Failed to load project:', err);
        setError('Failed to load the project.');
      })
      .finally(() => setLoading(false));
  }, [projectId, chapterQuery, termQuery]);

  useEffect(() => {
    if (!chapters.length) return;
    let active = true;
    const savedState = getReaderState(projectId);
    const savedScroll = savedState.scrollByChapter?.[currentNum];
    restoreScrollRef.current = typeof savedScroll === 'number' ? savedScroll : 0;
    stop();
    setListening(false);
    setChapter(null);
    getChapter(projectId, currentNum)
      .then((data) => {
        if (!active) return;
        setChapter(data);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError('Failed to load this chapter.');
      });
    return () => {
      active = false;
    };
  }, [projectId, currentNum, chapters]);

  useEffect(() => {
    if (!chapter) return;
    if (restoreScrollRef.current == null) return;
    const textPanel = textPanelRef.current;
    if (!textPanel) return;

    const scrollTop = restoreScrollRef.current;
    restoreScrollRef.current = null;

    requestAnimationFrame(() => {
      textPanel.scrollTop = scrollTop;
      const fnPanel = footnotePanelRef.current;
      if (!fnPanel) return;
      const ratio = textPanel.scrollTop / (textPanel.scrollHeight - textPanel.clientHeight || 1);
      fnPanel.scrollTop = ratio * (fnPanel.scrollHeight - fnPanel.clientHeight);
    });
  }, [chapter]);

  useEffect(() => {
    if (!chapters.length) return;
    setReaderState(projectId, {
      currentNum,
      fontSize,
      notesOpen,
      sideBySide,
      rightLevel,
      showNativeScript,
    });
  }, [projectId, chapters.length, currentNum, fontSize, notesOpen, sideBySide, rightLevel, showNativeScript]);

  useEffect(
    () => () => {
      const textPanel = textPanelRef.current;
      if (!textPanel) return;
      setReaderState(projectId, {
        scrollByChapter: { [currentNum]: textPanel.scrollTop },
      });
    },
    [projectId, currentNum]
  );

  // Sync footnote panel scroll with text panel
  useEffect(() => {
    const textPanel = textPanelRef.current;
    if (!textPanel) return;

    function handleScroll() {
      const fnPanel = footnotePanelRef.current;
      if (!fnPanel) return;
      const ratio = textPanel.scrollTop / (textPanel.scrollHeight - textPanel.clientHeight || 1);
      fnPanel.scrollTop = ratio * (fnPanel.scrollHeight - fnPanel.clientHeight);

      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current);
      }
      scrollSaveTimerRef.current = setTimeout(() => {
        setReaderState(projectId, {
          scrollByChapter: { [currentNum]: textPanel.scrollTop },
        });
      }, 120);
    }

    textPanel.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      textPanel.removeEventListener('scroll', handleScroll);
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current);
        scrollSaveTimerRef.current = null;
      }
    };
  }, [chapter, projectId, currentNum]);

  const goToChapter = useCallback(
    (num) => {
      const chNums = chapters.map((c) => c.chapter_num);
      if (chNums.includes(num)) setCurrentNum(num);
    },
    [chapters]
  );

  const chapterNums = chapters.map((c) => c.chapter_num);
  const currentIdx = chapterNums.indexOf(currentNum);
  const prevNum = currentIdx > 0 ? chapterNums[currentIdx - 1] : null;
  const nextNum = currentIdx < chapterNums.length - 1 ? chapterNums[currentIdx + 1] : null;

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft' && prevNum != null) goToChapter(prevNum);
      if (e.key === 'ArrowRight' && nextNum != null) goToChapter(nextNum);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [prevNum, nextNum, goToChapter]);

  function toggleRead(num) {
    setReadState((prev) => {
      const next = prev.includes(num)
        ? prev.filter((n) => n !== num)
        : [...prev, num];
      setReadChapters(projectId, next);
      return next;
    });
  }

  // Double-click any word → open chat with grammar question
  function handleTermDoubleClick({ display, footnote }) {
    let question;
    if (footnote?.translation) {
      question = `Explain the grammar of "${display}" (${footnote.translation}). Why is this form used here? What are the rules?`;
    } else {
      question = `What does "${display}" mean in this context? Explain its grammar and usage.`;
    }
    setChatInitialMessage(question);
    setChatOpen(true);
  }

  function handleAddFlashcard(fn, schema) {
    const term = {
      term: fn.term,
      term_key: fn.term.toLowerCase(),
      native_script: fn.native_script || '',
      pronunciation: fn.pronunciation || '',
      translation: fn.translation || '',
      grammar_note: fn.grammar_note || '',
      language: project?.target_language || 'en',
      project_id: projectId,
      first_chapter: currentNum,
    };
    let substitution = null;
    if (schema === 'substitution' && chapter) {
      substitution = buildSubstitutionData({
        chapter,
        termKey: term.term_key,
        sourceText: chapter.source_text || '',
        transformedText: chapter.content || '',
        targetDisplay: fn.native_script || fn.term,
        translation: fn.translation,
      });
    }
    const card = createFlashcardFromTerm(term, schema, substitution);
    const result = upsertFlashcard(card);
    const key = `${fn.term}_${schema}`;
    setCardFeedback((prev) => ({ ...prev, [key]: result.mode === 'created' ? 'Created' : 'Updated' }));
    setTimeout(() => setCardFeedback((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    }), 2000);
  }

  // Check if all levels are read
  const allLevelsRead = chapters.length > 0 &&
    chapters.filter((c) => c.chapter_num !== 0).every((c) => readChapters.includes(c.chapter_num));

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-3.5rem)]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-[calc(100vh-3.5rem)] gap-4">
        <p className="text-red-600">{error}</p>
        <Button variant="secondary" onClick={() => navigate('/dashboard')}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  const paragraphs = chapter?.content
    ? chapter.content.split('\n\n').filter(Boolean)
    : [];

  const footnotes = chapter?.footnotes || [];

  // Group footnotes by paragraph
  const footnotesByPara = {};
  footnotes.forEach((fn) => {
    const idx = fn.paragraph_index ?? 0;
    if (!footnotesByPara[idx]) footnotesByPara[idx] = [];
    footnotesByPara[idx].push(fn);
  });
  const sortedParaKeys = Object.keys(footnotesByPara).sort((a, b) => a - b);

  // Build term key → footnote lookup for AnnotatedParagraph hover tooltips
  const footnotesByKey = {};
  footnotes.forEach((fn) => {
    const key = fn.term.toLowerCase();
    if (!footnotesByKey[key]) footnotesByKey[key] = fn;
  });

  const currentFontClass = FONT_SIZES.find((f) => f.value === fontSize)?.class || 'text-lg';
  const readCount = readChapters.length;
  const totalCount = chapters.length;
  const progressPct = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  const isOriginal = currentNum === 0;
  const levelLabel = isOriginal ? 'Original' : `Level ${currentNum}`;
  const targetScript = LANGUAGES[project?.target_language || 'en']?.script || 'latin';
  const userCefr = project && currentUser?.levels?.[project.target_language] != null
    ? levelToCefr(currentUser.levels[project.target_language])
    : null;
  const activeLevelForScriptToggle = sideBySide ? rightLevel : currentNum;
  const canToggleNativeScript = targetScript !== 'latin' && activeLevelForScriptToggle >= 6;
  const forceNativeScript = canToggleNativeScript && showNativeScript;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg">
        <button
          onClick={() => { stop(); navigate('/dashboard'); }}
          className="text-sm text-text-muted hover:text-text"
        >
          &larr; Dashboard
        </button>

        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="font-medium">
              {project && <Flag code={project.target_language} size="sm" />} {levelLabel}
            </span>
            {!isOriginal && (
              <span className="text-text-muted">
                {' '}&middot; {currentIdx + 1}/{totalCount}
              </span>
            )}
          </div>

          {/* Level pills */}
          <div className="flex items-center gap-1">
            {chapterNums.map((num) => (
              <button
                key={num}
                onClick={() => setCurrentNum(num)}
                className={`w-7 h-7 rounded-full text-xs font-medium transition-colors ${
                  num === currentNum
                    ? 'bg-accent text-white'
                    : readChapters.includes(num)
                      ? 'bg-accent/20 text-accent'
                      : 'bg-surface text-text-muted hover:text-text'
                }`}
              >
                {num}
              </button>
            ))}
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-text-muted">
              {readCount}/{totalCount}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Listen toggle — only for level 0 (source) and 7 (target) */}
          {speechSupported() && (currentNum === 0 || currentNum === 7) && (
            <button
              onClick={() => {
                if (listening) {
                  stop();
                  setListening(false);
                } else {
                  const fullText = paragraphs.join('\n\n');
                  const voiceLang = currentNum === 7
                    ? (project?.target_language || 'en')
                    : (project?.source_language || 'en');
                  setListening(true);
                  speak(fullText, voiceLang, {
                    rate: 0.85,
                    onEnd: () => setListening(false),
                    footnotesByKey,
                  });
                }
              }}
              className={`text-sm transition-colors ${
                listening ? 'text-accent font-medium' : 'text-text-muted hover:text-text'
              }`}
            >
              {listening ? 'Stop' : 'Listen'}
            </button>
          )}

          {/* Notes toggle */}
          <button
            onClick={() => setNotesOpen((o) => !o)}
            className={`text-sm transition-colors ${
              notesOpen ? 'text-accent font-medium' : 'text-text-muted hover:text-text'
            }`}
          >
            Notes
          </button>

          {canToggleNativeScript && (
            <button
              onClick={() => setShowNativeScript((v) => !v)}
              className={`text-sm transition-colors ${
                showNativeScript ? 'text-accent font-medium' : 'text-text-muted hover:text-text'
              }`}
            >
              {showNativeScript ? 'Script: Native' : 'Script: Romanized'}
            </button>
          )}

          {/* Compare toggle */}
          <button
            onClick={() => {
              setSideBySide((o) => {
                if (!o) {
                  const transformedLevels = chapterNums.filter((num) => num !== 0);
                  const preferredLevel = transformedLevels.includes(currentNum)
                    ? currentNum
                    : transformedLevels[0];
                  if (preferredLevel != null) {
                    setRightLevel(preferredLevel);
                  }
                } else {
                  setCurrentNum(rightLevel);
                }
                return !o;
              });
            }}
            className={`text-sm transition-colors ${
              sideBySide ? 'text-accent font-medium' : 'text-text-muted hover:text-text'
            }`}
          >
            Compare
          </button>

          {/* Chat toggle */}
          <button
            onClick={() => { setChatOpen((o) => !o); setChatInitialMessage(null); }}
            className={`text-sm transition-colors ${
              chatOpen ? 'text-accent font-medium' : 'text-text-muted hover:text-text'
            }`}
          >
            Ask Claude
          </button>

          {/* Quiz toggle */}
          <button
            onClick={() => setQuizOpen((o) => !o)}
            className={`text-sm transition-colors ${
              quizOpen ? 'text-accent font-medium' : 'text-text-muted hover:text-text'
            }`}
          >
            Quiz
          </button>

          {/* Font size toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            {FONT_SIZES.map((fs) => (
              <button
                key={fs.value}
                onClick={() => setFontSize(fs.value)}
                className={`px-2 py-1 ${fs.class} leading-none ${
                  fontSize === fs.value
                    ? 'bg-accent text-white'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {fs.label}
              </button>
            ))}
          </div>

          {/* Export dropdown */}
          <div className="relative group">
            <button className="text-sm text-text-muted hover:text-text">
              Export &#9662;
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full pt-1 z-10">
            <div className="bg-bg border border-border rounded-lg shadow-sm py-1 min-w-[120px]">
              {['pdf', 'md', 'epub'].map((fmt) => (
                <a
                  key={fmt}
                  href={getExportUrl(projectId, fmt)}
                  className="block px-3 py-1.5 text-sm text-text hover:bg-surface no-underline"
                >
                  {fmt.toUpperCase()}
                </a>
              ))}
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main reading area */}
      <div className="flex-1 flex overflow-hidden">
        {sideBySide ? (
          <SideBySideView
            projectId={projectId}
            chapterNums={chapterNums}
            rightLevel={rightLevel}
            onRightLevelChange={setRightLevel}
            project={project}
            fontClass={currentFontClass}
            onTermDoubleClick={handleTermDoubleClick}
            focusedTermKey={focusedTermKey}
            showNativeScript={forceNativeScript}
          />
        ) : (
          /* Text panel */
          <div ref={textPanelRef} className="flex-1 overflow-y-auto px-12 py-8">
            {!chapter ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : (
              <div className="max-w-2xl mx-auto">
                {paragraphs.map((para, i) => (
                  <AnnotatedParagraph
                    key={`${currentNum}-${i}`}
                    text={para}
                    footnotesByKey={footnotesByKey}
                    fontClass={currentFontClass}
                    onTermDoubleClick={handleTermDoubleClick}
                    langCode={project?.target_language || 'en'}
                    sourceLangCode={project?.source_language || 'en'}
                    level={currentNum}
                    focusedTermKey={focusedTermKey}
                    forceNativeScript={forceNativeScript}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footnote panel */}
        {notesOpen && (
          <div
            ref={footnotePanelRef}
            className="w-80 border-l border-border overflow-y-auto overflow-x-hidden px-5 py-8 bg-surface/50"
          >
            {isOriginal ? (
              <p className="text-sm text-text-muted">
                This is the original text. Click <strong>Next</strong> to see it transform.
              </p>
            ) : footnotes.length === 0 ? (
              <p className="text-sm text-text-muted">
                {chapter ? 'No new terms at this level.' : ''}
              </p>
            ) : (
              <div>
                {sortedParaKeys.map((paraIdx) => (
                  <div
                    key={paraIdx}
                    className="mb-5 pb-5 border-b border-border/50 last:border-0"
                  >
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                      &para;{Number(paraIdx) + 1}
                    </div>
                    {footnotesByPara[paraIdx].map((fn, j) => (
                      <div key={j} className="mb-2 group/fn">
                        <div className="break-words">
                          <span className="text-sm font-medium text-accent">
                            {fn.term}
                          </span>
                          {fn.native_script && fn.native_script !== fn.term && (
                            <span className="text-sm text-text-muted ml-1">
                              ({fn.native_script})
                            </span>
                          )}
                          {fn.pronunciation && (
                            <span className="text-xs text-text-muted italic ml-1">
                              /{fn.pronunciation}/
                            </span>
                          )}
                          {fn.translation && (
                            <span className="text-sm text-text">
                              {' '}&mdash; {fn.translation}
                            </span>
                          )}
                          {/* Flashcard buttons */}
                          <span className="inline-flex gap-1 ml-1.5 opacity-0 group-hover/fn:opacity-100 transition-opacity">
                            {[
                              { schema: 'target_en', label: 'T\u2192E' },
                              { schema: 'en_target', label: 'E\u2192T' },
                            ].map(({ schema, label }) => {
                              const fbKey = `${fn.term}_${schema}`;
                              return cardFeedback[fbKey] ? (
                                <span key={schema} className="text-[10px] text-emerald-600">
                                  {cardFeedback[fbKey]}
                                </span>
                              ) : (
                                <button
                                  key={schema}
                                  onClick={() => handleAddFlashcard(fn, schema)}
                                  title={`Add ${label} flashcard`}
                                  className="text-[10px] px-1 py-0.5 rounded bg-surface hover:bg-border/50 text-text-muted hover:text-text"
                                >
                                  +{label}
                                </button>
                              );
                            })}
                          </span>
                        </div>
                        {fn.grammar_note && (
                          <p className="text-xs text-text-muted mt-0.5 leading-snug">
                            {fn.grammar_note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat panel */}
        {chatOpen && (
          <ReaderChat
            projectId={projectId}
            currentLevel={currentNum}
            initialMessage={chatInitialMessage}
            onClose={() => setChatOpen(false)}
            messages={chatMessages}
            setMessages={setChatMessages}
            userCefr={userCefr}
          />
        )}

        {/* Quiz panel */}
        {quizOpen && (
          <ComprehensionQuiz
            projectId={projectId}
            currentLevel={currentNum}
            onClose={() => setQuizOpen(false)}
          />
        )}
      </div>

      {/* Congratulations banner */}
      {allLevelsRead && (
        <div className="border-t border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-6 py-4">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
              Congratulations! You've read all levels.
            </p>
            <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
              You've progressed from the original text through full {LANGUAGES[project?.target_language]?.name || 'target language'}.
            </p>
            <div className="flex items-center justify-center gap-3 mt-3">
              <Button size="sm" onClick={() => navigate('/project/new')}>
                Start a new project
              </Button>
              <Button size="sm" variant="secondary" onClick={() => navigate('/flashcards')}>
                Review flashcards
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-bg">
        <Button
          variant="ghost"
          disabled={prevNum == null}
          onClick={() => goToChapter(prevNum)}
        >
          &larr; Previous
        </Button>
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-muted">
            {levelLabel}
          </span>
          <button
            onClick={() => toggleRead(currentNum)}
            className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
              readChapters.includes(currentNum)
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-text-muted hover:border-accent hover:text-accent'
            }`}
          >
            {readChapters.includes(currentNum) ? 'Read' : 'Mark as read'}
          </button>
        </div>
        <Button
          variant="ghost"
          disabled={nextNum == null}
          onClick={() => goToChapter(nextNum)}
        >
          Next &rarr;
        </Button>
      </div>
    </div>
  );
}
