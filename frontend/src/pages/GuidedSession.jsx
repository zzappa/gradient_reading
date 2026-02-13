import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  evaluateComprehension,
  generateComprehension,
  getChapter,
  getChapters,
  getProjects,
} from '../api/client';
import AnnotatedParagraph from '../components/reader/AnnotatedParagraph';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Spinner from '../components/ui/Spinner';
import { useUser } from '../context/UserContext';
import { LANGUAGES, nameFor } from '../languages';
import { splitChapterParagraphs } from '../utils/chapterContent';
import {
  formatSchemaLabel,
  getDueFlashcards,
  loadFlashcards,
  reviewFlashcard,
  saveFlashcards,
} from '../utils/flashcards';
import { levelToCefr } from '../utils/cefr';

const SESSION_FLASHCARD_TARGET = 5;
const SESSION_QUESTION_TARGET = 3;
const ANNOTATION_RE = /\{\{([^|]+)\|\}?([^|}]+)(?:\|\}?([^}]*))?\}\}?/g;
const SESSION_CHUNK_BAG_KEY = 'gradient_session_chunk_bag_v1';

function plainTextLength(text) {
  return (text || '').replace(ANNOTATION_RE, '$1').replace(/\s+/g, ' ').trim().length;
}

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function chunkBagKey(projectId, level) {
  return `${projectId}:${level}`;
}

function loadChunkBagState() {
  if (typeof localStorage === 'undefined') return {};
  return safeParse(localStorage.getItem(SESSION_CHUNK_BAG_KEY), {});
}

function saveChunkBagState(state) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SESSION_CHUNK_BAG_KEY, JSON.stringify(state));
}

function chunkCandidates(paragraphs) {
  const indexed = (paragraphs || [])
    .map((text, index) => ({ index, text: (text || '').trim() }))
    .filter((item) => item.text);
  if (!indexed.length) return [];

  // Prefer reasonably substantive chunks, but allow fallback to any paragraph.
  const readable = indexed.filter((item) => plainTextLength(item.text) >= 40);
  return readable.length ? readable : indexed;
}

function pickReadChunk(paragraphs, projectId, level) {
  const candidates = chunkCandidates(paragraphs);
  if (!candidates.length) return '';
  if (!projectId) return candidates[Math.floor(Math.random() * candidates.length)].text;

  const key = chunkBagKey(projectId, level);
  const signature = candidates.map((item) => item.index).join(',');
  const candidateByIndex = new Map(candidates.map((item) => [item.index, item.text]));
  const state = loadChunkBagState();
  const previous = state[key];

  const previousIsValid = previous
    && previous.signature === signature
    && Array.isArray(previous.remaining);

  let remaining = previousIsValid ? previous.remaining.filter((idx) => candidateByIndex.has(idx)) : [];
  const lastIndex = previousIsValid && Number.isInteger(previous.lastIndex) ? previous.lastIndex : null;

  if (!remaining.length) {
    remaining = shuffle(candidates.map((item) => item.index));
    if (lastIndex !== null && remaining.length > 1 && remaining[0] === lastIndex) {
      [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
    }
  }

  const chosenIndex = remaining[0];
  const nextRemaining = remaining.slice(1);
  const chosenText = candidateByIndex.get(chosenIndex) || candidates[0].text;

  state[key] = {
    signature,
    remaining: nextRemaining,
    lastIndex: chosenIndex,
  };
  saveChunkBagState(state);

  return chosenText;
}

function pickClosestLevel(levels, preferredLevel) {
  if (!levels.length) return 0;
  if (!Number.isFinite(preferredLevel)) return levels[0];
  if (levels.includes(preferredLevel)) return preferredLevel;

  let best = levels[0];
  let bestDistance = Math.abs(levels[0] - preferredLevel);
  for (const level of levels) {
    const distance = Math.abs(level - preferredLevel);
    if (distance < bestDistance) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

function nextHigherLevel(levels, current) {
  return levels.find((level) => level > current) ?? current;
}

function nextLowerLevel(levels, current) {
  const below = levels.filter((level) => level < current);
  return below.length ? below[below.length - 1] : current;
}

function recommendNextLevel(levels, current, quizResults, reviewResults) {
  if (!levels.length || !levels.includes(current)) return current;
  const quizTotal = quizResults.length;
  const quizCorrect = quizResults.filter(Boolean).length;
  const quizAccuracy = quizTotal > 0 ? quizCorrect / quizTotal : 0;

  const reviewTotal = reviewResults.length;
  const againCount = reviewResults.filter((item) => item.rating === 'again').length;
  const againRate = reviewTotal > 0 ? againCount / reviewTotal : 0;

  if (quizTotal > 0 && quizAccuracy >= 0.8 && againRate <= 0.4) {
    return nextHigherLevel(levels, current);
  }
  if (quizTotal > 0 && (quizAccuracy < 0.4 || againRate > 0.7)) {
    return nextLowerLevel(levels, current);
  }
  return current;
}

function renderCardFront(card) {
  if (card.schema === 'target_en') {
    return (
      <>
        <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
          {formatSchemaLabel(card.schema)}
        </p>
        <p className="font-serif text-3xl text-center">{card.realScript || card.term}</p>
        {card.romanization && (
          <p className="text-sm text-text-muted text-center mt-2">{card.romanization}</p>
        )}
      </>
    );
  }

  if (card.schema === 'substitution') {
    return (
      <>
        <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
          {formatSchemaLabel(card.schema)}
        </p>
        <p className="text-sm text-text-muted text-center mb-2">
          {(card.substitution?.prompt || '').trim() || 'Replace the highlighted target word with English.'}
        </p>
        <p className="font-serif text-2xl text-center leading-relaxed">
          {card.substitution?.frontSentence || card.term}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
        {formatSchemaLabel(card.schema)}
      </p>
      <p className="font-serif text-3xl text-center">{card.translation || card.term}</p>
    </>
  );
}

function renderCardBack(card) {
  if (card.schema === 'target_en') {
    return <p className="font-serif text-3xl text-center">{card.translation || card.term}</p>;
  }

  if (card.schema === 'substitution') {
    const answer = (card.substitution?.answer || '').trim() || card.translation || card.term;
    const corrected = (card.substitution?.correctedSentence || '').trim();
    return (
      <>
        <p className="font-serif text-3xl text-center text-emerald-600 dark:text-emerald-400">
          {answer}
        </p>
        {corrected && (
          <p className="text-sm text-text-muted text-center mt-3 leading-relaxed">
            {corrected}
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <p className="font-serif text-3xl text-center">{card.realScript || card.term}</p>
      {card.romanization && (
        <p className="text-sm text-text-muted text-center mt-2">{card.romanization}</p>
      )}
    </>
  );
}

function levelLabel(level) {
  return level === 0 ? 'Original (0)' : `Level ${level}`;
}

export default function GuidedSession() {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const [searchParams] = useSearchParams();
  const queryProjectId = searchParams.get('project');
  const queryLevel = Number.parseInt(searchParams.get('level') || '', 10);

  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [setupError, setSetupError] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [chapters, setChapters] = useState([]);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [sessionLevel, setSessionLevel] = useState(0);

  const [stage, setStage] = useState('setup');
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState(null);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [activeLevel, setActiveLevel] = useState(0);
  const [chapter, setChapter] = useState(null);
  const [readChunk, setReadChunk] = useState('');
  const [showNativeScript, setShowNativeScript] = useState(false);

  const [quizQuestions, setQuizQuestions] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizInput, setQuizInput] = useState('');
  const [quizFeedback, setQuizFeedback] = useState(null);
  const [quizEvaluating, setQuizEvaluating] = useState(false);
  const [quizResults, setQuizResults] = useState([]);

  const [, setAllCards] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [showCardAnswer, setShowCardAnswer] = useState(false);
  const [reviewResults, setReviewResults] = useState([]);

  const currentProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) || currentProject,
    [projects, activeProjectId, currentProject]
  );

  const availableLevels = useMemo(
    () => chapters.map((chapterData) => chapterData.chapter_num).sort((a, b) => a - b),
    [chapters]
  );

  const footnotesByKey = useMemo(() => {
    const map = {};
    for (const footnote of chapter?.footnotes || []) {
      const key = (footnote.term || '').toLowerCase().trim();
      if (key && !map[key]) map[key] = footnote;
    }
    return map;
  }, [chapter]);

  const dueCountForLanguage = useMemo(() => {
    if (!currentProject) return 0;
    const cards = loadFlashcards();
    const languageCards = cards.filter((card) => card.language === currentProject.target_language);
    return getDueFlashcards(languageCards).length;
  }, [currentProject]);

  const quizCorrect = quizResults.filter(Boolean).length;
  const quizAccuracy = quizResults.length > 0 ? quizCorrect / quizResults.length : 0;
  const flashCorrect = reviewResults.filter((result) => result.rating !== 'again').length;
  const flashAccuracy = reviewResults.length > 0 ? flashCorrect / reviewResults.length : 0;
  const combinedTotal = quizResults.length + reviewResults.length;
  const combinedCorrect = quizCorrect + flashCorrect;
  const overallAccuracy = combinedTotal > 0 ? combinedCorrect / combinedTotal : 0;
  const newWordsLearned = reviewResults.filter((result) => result.newlyLearned).length;

  const recommendedLevel = useMemo(
    () => recommendNextLevel(availableLevels, activeLevel, quizResults, reviewResults),
    [availableLevels, activeLevel, quizResults, reviewResults]
  );

  const currentQuestion = quizQuestions[quizIndex];
  const currentCard = reviewQueue[reviewIndex];
  const targetScript = LANGUAGES[activeProject?.target_language || 'en']?.script || 'latin';
  const canToggleNativeScript = targetScript !== 'latin' && activeLevel >= 6;
  const forceNativeScript = canToggleNativeScript && showNativeScript;

  useEffect(() => {
    if (!canToggleNativeScript && showNativeScript) {
      setShowNativeScript(false);
    }
  }, [canToggleNativeScript, showNativeScript]);

  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    setProjectsLoading(true);
    setSetupError(null);

    getProjects(currentUser.id)
      .then((data) => {
        if (cancelled) return;
        const completed = data.filter((project) => project.status === 'completed');
        const candidates = completed.length ? completed : data.filter((project) => project.status !== 'created');
        setProjects(candidates);

        if (!candidates.length) {
          setSelectedProjectId('');
          return;
        }

        const queryMatch = queryProjectId && candidates.some((project) => project.id === queryProjectId)
          ? queryProjectId
          : null;
        setSelectedProjectId(queryMatch || candidates[0].id);
      })
      .catch((err) => {
        console.error('Failed to load session projects:', err);
        if (!cancelled) setSetupError('Failed to load projects for guided sessions.');
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, queryProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setChapters([]);
      return;
    }

    const selectedProject = projects.find((project) => project.id === selectedProjectId);
    if (!selectedProject) return;

    let cancelled = false;
    setLevelsLoading(true);
    setSetupError(null);

    getChapters(selectedProjectId)
      .then((data) => {
        if (cancelled) return;

        const sorted = [...data].sort((a, b) => a.chapter_num - b.chapter_num);
        setChapters(sorted);

        const levels = sorted.map((chapterData) => chapterData.chapter_num).sort((a, b) => a - b);
        if (!levels.length) {
          setSessionLevel(0);
          return;
        }

        const userLevel = Number(currentUser?.levels?.[selectedProject.target_language]);
        const fallbackLevel = Number.isFinite(userLevel) ? userLevel : selectedProject.start_level;
        const preferredLevel = Number.isFinite(queryLevel) ? queryLevel : fallbackLevel;
        setSessionLevel(pickClosestLevel(levels, preferredLevel));
      })
      .catch((err) => {
        console.error('Failed to load project levels:', err);
        if (!cancelled) setSetupError('Failed to load transformed levels for this project.');
      })
      .finally(() => {
        if (!cancelled) setLevelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, projects, currentUser, queryLevel]);

  function resetSession() {
    setStage('setup');
    setPreparing(false);
    setPrepareError(null);
    setActiveProjectId('');
    setActiveLevel(sessionLevel);
    setChapter(null);
    setReadChunk('');
    setShowNativeScript(false);
    setQuizQuestions([]);
    setQuizIndex(0);
    setQuizInput('');
    setQuizFeedback(null);
    setQuizEvaluating(false);
    setQuizResults([]);
    setAllCards([]);
    setReviewQueue([]);
    setReviewIndex(0);
    setShowCardAnswer(false);
    setReviewResults([]);
  }

  async function handleStartSession() {
    if (!currentProject || !selectedProjectId) return;
    if (!availableLevels.length) {
      setPrepareError('This project has no generated levels yet.');
      return;
    }

    const level = pickClosestLevel(availableLevels, sessionLevel);
    setPreparing(true);
    setPrepareError(null);

    try {
      const [chapterData, quizData] = await Promise.all([
        getChapter(selectedProjectId, level),
        generateComprehension(selectedProjectId, level),
      ]);

      const questions = (quizData?.questions || []).filter(Boolean).slice(0, SESSION_QUESTION_TARGET);
      if (questions.length < SESSION_QUESTION_TARGET) {
        throw new Error('Could not generate enough quiz questions. Please try again.');
      }

      const paragraphs = splitChapterParagraphs(chapterData?.content || '');
      const chunk = pickReadChunk(paragraphs, selectedProjectId, level);
      if (!chunk) {
        throw new Error('This level has no readable chunk yet.');
      }

      const cards = loadFlashcards();
      const dueForLanguage = getDueFlashcards(
        cards.filter((card) => card.language === currentProject.target_language)
      );
      const dueFallback = dueForLanguage.length ? dueForLanguage : getDueFlashcards(cards);
      const queue = dueFallback.slice(0, SESSION_FLASHCARD_TARGET);

      setActiveProjectId(selectedProjectId);
      setActiveLevel(level);
      setChapter(chapterData);
      setReadChunk(chunk);

      setQuizQuestions(questions);
      setQuizIndex(0);
      setQuizInput('');
      setQuizFeedback(null);
      setQuizResults([]);

      setAllCards(cards);
      setReviewQueue(queue);
      setReviewIndex(0);
      setShowCardAnswer(false);
      setReviewResults([]);

      setStage('read');
    } catch (err) {
      console.error('Failed to start guided session:', err);
      setPrepareError(err?.message || 'Failed to prepare guided session.');
    } finally {
      setPreparing(false);
    }
  }

  async function handleSubmitQuizAnswer(event) {
    event.preventDefault();
    if (!currentQuestion || !quizInput.trim()) return;

    setQuizEvaluating(true);
    try {
      const data = await evaluateComprehension(
        activeProjectId,
        currentQuestion,
        quizInput.trim(),
        activeLevel
      );
      const result = Boolean(data?.correct);
      setQuizResults((prev) => [...prev, result]);
      setQuizFeedback({
        correct: result,
        feedback: data?.feedback || '',
        answer: quizInput.trim(),
      });
    } catch (err) {
      console.error('Failed to evaluate answer:', err);
      setQuizResults((prev) => [...prev, false]);
      setQuizFeedback({
        correct: false,
        feedback: 'Failed to evaluate this answer. Counted as incorrect for this session.',
        answer: quizInput.trim(),
      });
    } finally {
      setQuizEvaluating(false);
    }
  }

  function handleNextQuestion() {
    const isLast = quizIndex + 1 >= quizQuestions.length;
    if (isLast) {
      setStage('review');
      setQuizFeedback(null);
      setQuizInput('');
      return;
    }

    setQuizIndex((prev) => prev + 1);
    setQuizInput('');
    setQuizFeedback(null);
  }

  function handleReviewRating(rating) {
    if (!currentCard) return;

    const previousRepetitions = Number(currentCard.stats?.repetitions || 0);
    const updatedCard = reviewFlashcard(currentCard, rating);

    setReviewQueue((prev) => {
      const next = [...prev];
      next[reviewIndex] = updatedCard;
      return next;
    });

    setAllCards((prev) => {
      const idx = prev.findIndex((card) => card.id === updatedCard.id);
      let next;
      if (idx >= 0) {
        next = [...prev];
        next[idx] = updatedCard;
      } else {
        next = [updatedCard, ...prev];
      }
      saveFlashcards(next);
      return next;
    });

    setReviewResults((prev) => [
      ...prev,
      {
        rating,
        newlyLearned: previousRepetitions === 0 && rating !== 'again',
      },
    ]);

    const isLast = reviewIndex + 1 >= reviewQueue.length;
    if (isLast) {
      setStage('done');
      return;
    }

    setReviewIndex((prev) => prev + 1);
    setShowCardAnswer(false);
  }

  function handleCompleteWithoutCards() {
    setStage('done');
  }

  function handleStartAnother() {
    resetSession();
    setSessionLevel(recommendedLevel);
  }

  if (!currentUser) {
    return (
      <PageLayout>
        <p className="text-text-muted">Select a user to start a guided session.</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-semibold">Guided Session</h1>
          <p className="text-text-muted mt-2">
            One focused cycle: read one chunk, answer three questions, review up to five due cards.
          </p>
        </div>

        {stage === 'setup' && (
          <Card className="p-6 space-y-6">
            {projectsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : projects.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-text-muted mb-4">
                  No transformed projects available yet.
                </p>
                <Button onClick={() => navigate('/project/new')}>Create a project</Button>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-2">Project</label>
                  <select
                    value={selectedProjectId}
                    onChange={(event) => setSelectedProjectId(event.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/50"
                  >
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title} ({nameFor(project.target_language)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="text-sm font-medium mb-2">Session level</div>
                  {levelsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Spinner size="sm" /> Loading levels...
                    </div>
                  ) : availableLevels.length === 0 ? (
                    <p className="text-sm text-text-muted">No chapter levels are ready for this project yet.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableLevels.map((level) => (
                        <button
                          key={level}
                          onClick={() => setSessionLevel(level)}
                          className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                            sessionLevel === level
                              ? 'bg-accent text-white'
                              : 'bg-surface text-text-muted hover:text-text'
                          }`}
                        >
                          {levelLabel(level)}
                          {levelToCefr(level) ? ` (${levelToCefr(level)})` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-surface/60 p-4 text-sm space-y-1">
                  <div>1. Read one chunk from {levelLabel(sessionLevel)}.</div>
                  <div>2. Answer {SESSION_QUESTION_TARGET} comprehension questions.</div>
                  <div>
                    3. Review up to {SESSION_FLASHCARD_TARGET} due flashcards
                    {currentProject ? ` in ${nameFor(currentProject.target_language)}` : ''}.
                  </div>
                  <div className="text-text-muted pt-1">
                    {dueCountForLanguage > 0
                      ? `${dueCountForLanguage} due cards available for this language now.`
                      : 'No due cards yet for this language. The session will still run.'}
                  </div>
                </div>

                {(setupError || prepareError) && (
                  <p className="text-sm text-red-600">{prepareError || setupError}</p>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleStartSession}
                    disabled={preparing || levelsLoading || !currentProject || !availableLevels.length}
                  >
                    {preparing ? <Spinner size="sm" /> : 'Start guided session'}
                  </Button>
                  <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                    Back to dashboard
                  </Button>
                </div>
              </>
            )}
          </Card>
        )}

        {stage === 'read' && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Step 1 of 4</p>
                <h2 className="font-serif text-2xl font-semibold">Read the chunk</h2>
              </div>
              <div className="flex items-center gap-3">
                {canToggleNativeScript && (
                  <button
                    onClick={() => setShowNativeScript((prev) => !prev)}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                      showNativeScript
                        ? 'bg-accent text-white border-accent'
                        : 'bg-bg text-text-muted border-border hover:text-text'
                    }`}
                    title="Toggle native script"
                  >
                    {showNativeScript ? 'Native script on' : 'Native script off'}
                  </button>
                )}
                <span className="text-sm text-text-muted">
                  {activeProject?.title} • {levelLabel(activeLevel)}
                </span>
              </div>
            </div>

            <div className="border border-border rounded-lg p-5 bg-bg mb-6">
              <AnnotatedParagraph
                text={readChunk}
                footnotesByKey={footnotesByKey}
                fontClass="text-xl"
                onTermDoubleClick={() => {}}
                langCode={activeProject?.target_language || 'en'}
                sourceLangCode={activeProject?.source_language || 'en'}
                level={activeLevel}
                forceNativeScript={forceNativeScript}
              />
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={() => setStage('quiz')}>I finished reading</Button>
              <Button variant="secondary" onClick={resetSession}>Cancel session</Button>
            </div>
          </Card>
        )}

        {stage === 'quiz' && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Step 2 of 4</p>
                <h2 className="font-serif text-2xl font-semibold">Comprehension check</h2>
              </div>
              <span className="text-sm text-text-muted">
                Question {Math.min(quizIndex + 1, quizQuestions.length)} of {quizQuestions.length}
              </span>
            </div>

            <p className="text-base font-medium leading-relaxed mb-4">{currentQuestion}</p>

            {!quizFeedback ? (
              <form onSubmit={handleSubmitQuizAnswer} className="space-y-3">
                <textarea
                  value={quizInput}
                  onChange={(event) => setQuizInput(event.target.value)}
                  placeholder="Type your answer..."
                  className="w-full min-h-28 px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/50"
                  disabled={quizEvaluating}
                />
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={quizEvaluating || !quizInput.trim()}>
                    {quizEvaluating ? <Spinner size="sm" /> : 'Submit answer'}
                  </Button>
                  <Button type="button" variant="secondary" onClick={resetSession}>Cancel session</Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-text-muted">
                  Your answer: <span className="italic">{quizFeedback.answer}</span>
                </div>
                <div
                  className={`p-4 rounded-lg text-sm ${
                    quizFeedback.correct
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                  }`}
                >
                  <div className="font-medium mb-1">
                    {quizFeedback.correct ? 'Correct' : 'Needs work'}
                  </div>
                  {quizFeedback.feedback}
                </div>
                <Button onClick={handleNextQuestion}>
                  {quizIndex + 1 >= quizQuestions.length ? 'Continue to flashcards' : 'Next question'}
                </Button>
              </div>
            )}
          </Card>
        )}

        {stage === 'review' && (
          <Card className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">Step 3 of 4</p>
                <h2 className="font-serif text-2xl font-semibold">Flashcard review</h2>
              </div>
              <span className="text-sm text-text-muted">
                {reviewQueue.length
                  ? `Card ${reviewIndex + 1} of ${reviewQueue.length}`
                  : 'No due cards'}
              </span>
            </div>

            {reviewQueue.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-text-muted">
                  You have no due flashcards for this session right now.
                </p>
                <Button onClick={handleCompleteWithoutCards}>Finish session</Button>
              </div>
            ) : (
              <>
                <div className="border border-border rounded-lg p-6 bg-bg">
                  {renderCardFront(currentCard)}

                  {showCardAnswer && (
                    <div className="mt-6 pt-5 border-t border-border">
                      <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">Answer</p>
                      {renderCardBack(currentCard)}
                    </div>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  {!showCardAnswer ? (
                    <Button onClick={() => setShowCardAnswer(true)}>Reveal answer</Button>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={() => handleReviewRating('again')}>Again</Button>
                      <Button variant="secondary" onClick={() => handleReviewRating('hard')}>Hard</Button>
                      <Button onClick={() => handleReviewRating('good')}>Good</Button>
                      <Button variant="secondary" onClick={() => handleReviewRating('easy')}>Easy</Button>
                    </>
                  )}
                </div>
              </>
            )}
          </Card>
        )}

        {stage === 'done' && (
          <Card className="p-6">
            <p className="text-xs uppercase tracking-wide text-text-muted">Step 4 of 4</p>
            <h2 className="font-serif text-2xl font-semibold mb-6">Session complete</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="rounded-lg border border-border p-4">
                <div className="text-xs text-text-muted">New words learned</div>
                <div className="text-2xl font-semibold mt-1">{newWordsLearned}</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="text-xs text-text-muted">Quiz accuracy</div>
                <div className="text-2xl font-semibold mt-1">{Math.round(quizAccuracy * 100)}%</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="text-xs text-text-muted">Flashcard accuracy</div>
                <div className="text-2xl font-semibold mt-1">{Math.round(flashAccuracy * 100)}%</div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="text-xs text-text-muted">Overall accuracy</div>
                <div className="text-2xl font-semibold mt-1">{Math.round(overallAccuracy * 100)}%</div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface/60 p-4 mb-6">
              <div className="text-sm text-text-muted">Recommended next level</div>
              <div className="text-lg font-semibold mt-1">
                {levelLabel(recommendedLevel)}
                {levelToCefr(recommendedLevel) ? ` (${levelToCefr(recommendedLevel)})` : ''}
              </div>
              <div className="text-sm text-text-muted mt-1">
                Project: {activeProject?.title} ({nameFor(activeProject?.target_language || 'en')})
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => navigate(`/project/${activeProjectId}/read?chapter=${recommendedLevel}`)}
                disabled={!activeProjectId}
              >
                Open recommended level
              </Button>
              <Button variant="secondary" onClick={handleStartAnother}>Start another session</Button>
              <Button variant="secondary" onClick={() => navigate('/flashcards')}>Open flashcards</Button>
            </div>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
