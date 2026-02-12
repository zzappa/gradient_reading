import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Flag from '../components/ui/Flag';
import { ALPHABETS, getTabChars } from '../data/alphabets';
import {
  loadProgress,
  saveProgress,
  getCharProgress,
  reviewChar,
  getDueChars,
  getLearnedCount,
  getMasteryLevel,
  resetProgress,
  getNextDueAt,
} from '../utils/alphabetProgress';
import { isSupported as speechSupported, speakTerm, stop } from '../utils/speech';

const MASTERY_COLORS = {
  unseen: 'bg-surface',
  learning: 'bg-amber-100 dark:bg-amber-900/30',
  mastered: 'bg-emerald-100 dark:bg-emerald-900/30',
};

const MASTERY_RING = {
  unseen: '',
  learning: 'ring-2 ring-amber-300 dark:ring-amber-700',
  mastered: 'ring-2 ring-emerald-300 dark:ring-emerald-700',
};

function formatDue(value) {
  if (!value) return 'now';
  const delta = value - Date.now();
  if (delta <= 0) return 'now';
  if (delta < 60 * 60 * 1000) return `in ${Math.max(1, Math.round(delta / 60000))}m`;
  if (delta < 24 * 60 * 60 * 1000) return `in ${Math.round(delta / (60 * 60 * 1000))}h`;
  return `in ${Math.round(delta / (24 * 60 * 60 * 1000))}d`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickDistractors(correct, allChars, count = 3) {
  const others = allChars.filter((c) => c.char !== correct.char);
  return shuffle(others).slice(0, count);
}

const QUIZ_TYPES = ['char_to_romaji', 'romaji_to_char', 'sound_to_char'];

export default function AlphabetTrainer() {
  const { langCode } = useParams();
  const alphabet = ALPHABETS[langCode];

  const [activeTabId, setActiveTabId] = useState(null);
  const [mode, setMode] = useState('learn');
  const [progress, setProgress] = useState({});
  const [highlighted, setHighlighted] = useState(null);

  // Quiz state
  const [quizChar, setQuizChar] = useState(null);
  const [quizType, setQuizType] = useState(null);
  const [quizOptions, setQuizOptions] = useState([]);
  const [quizInput, setQuizInput] = useState('');
  const [quizRevealed, setQuizRevealed] = useState(false);
  const [quizCorrect, setQuizCorrect] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  useEffect(() => {
    if (alphabet && !activeTabId) {
      setActiveTabId(alphabet.tabs[0].id);
    }
  }, [alphabet, activeTabId]);

  useEffect(() => () => stop(), []);

  const activeTab = useMemo(
    () => alphabet?.tabs.find((t) => t.id === activeTabId) || null,
    [alphabet, activeTabId]
  );

  const allChars = useMemo(() => getTabChars(activeTab), [activeTab]);

  const dueChars = useMemo(
    () => getDueChars(progress, langCode, activeTabId, allChars),
    [progress, langCode, activeTabId, allChars]
  );

  const learnedCount = useMemo(
    () => getLearnedCount(progress, langCode, activeTabId, allChars),
    [progress, langCode, activeTabId, allChars]
  );

  if (!alphabet) {
    return (
      <PageLayout>
        <p className="text-text-muted">
          No alphabet data available for language code "{langCode}".
        </p>
      </PageLayout>
    );
  }

  function handleSpeak(char) {
    if (!speechSupported()) return;
    speakTerm(char.romaji, langCode, char.char);
  }

  function handleCellClick(char) {
    setHighlighted(char.char);
    handleSpeak(char);
  }

  function startQuiz() {
    if (!allChars.length) return;
    const pool = dueChars.length > 0 ? dueChars : allChars;
    const char = pool[Math.floor(Math.random() * pool.length)];
    const type = QUIZ_TYPES[Math.floor(Math.random() * QUIZ_TYPES.length)];

    setQuizChar(char);
    setQuizType(type);
    setQuizRevealed(false);
    setQuizCorrect(null);
    setQuizInput('');

    if (type === 'romaji_to_char' || type === 'sound_to_char') {
      const distractors = pickDistractors(char, allChars);
      setQuizOptions(shuffle([char, ...distractors]));
    } else {
      setQuizOptions([]);
    }

    if (type === 'sound_to_char') {
      setTimeout(() => handleSpeak(char), 200);
    }

    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function checkTypingAnswer() {
    if (!quizChar || quizRevealed) return;
    const answer = quizInput.trim().toLowerCase();
    const correct = quizChar.romaji.toLowerCase();
    setQuizCorrect(answer === correct);
    setQuizRevealed(true);
  }

  function checkPickAnswer(picked) {
    if (!quizChar || quizRevealed) return;
    setQuizCorrect(picked.char === quizChar.char);
    setQuizRevealed(true);
  }

  function handleRate(rating) {
    if (!quizChar) return;
    const next = reviewChar(progress, langCode, activeTabId, quizChar.char, rating);
    setProgress(next);
    saveProgress(next);
    startQuiz();
  }

  function handleReset() {
    if (!window.confirm('Reset all progress for this script? This cannot be undone.')) return;
    const next = resetProgress(langCode, activeTabId);
    setProgress(next);
  }

  useEffect(() => {
    if (mode === 'quiz') startQuiz();
  }, [mode, activeTabId]);

  const nextDue = useMemo(
    () => getNextDueAt(progress, langCode, activeTabId, allChars),
    [progress, langCode, activeTabId, allChars]
  );

  return (
    <PageLayout wide>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold">
            <Flag code={langCode} size="sm" /> {alphabet.name} Script
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {learnedCount}/{allChars.length} characters learned
            {dueChars.length > 0 && ` \u00b7 ${dueChars.length} due for review`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={mode === 'learn' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMode('learn')}
          >
            Learn
          </Button>
          <Button
            variant={mode === 'quiz' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMode('quiz')}
          >
            Quiz{dueChars.length > 0 ? ` (${dueChars.length})` : ''}
          </Button>
          <Button
            variant={mode === 'progress' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMode('progress')}
          >
            Progress
          </Button>
        </div>
      </div>

      {/* Script tabs */}
      {alphabet.tabs.length > 1 && (
        <div className="flex gap-2 mb-6">
          {alphabet.tabs.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTabId === tab.id ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setActiveTabId(tab.id);
                setHighlighted(null);
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      )}

      {/* Learn mode */}
      {mode === 'learn' && activeTab && (
        <div>
          {activeTab.columns ? (
            // Grid layout for Japanese-style tables
            <Card className="p-4 overflow-x-auto">
              <table className="w-full text-center">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-xs text-text-muted font-medium" />
                    {activeTab.columns.map((col) => (
                      <th key={col} className="px-2 py-1 text-xs text-text-muted font-medium">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeTab.groups.map((group, gi) => (
                    <tr key={gi}>
                      <td className="px-2 py-1 text-xs text-text-muted font-medium w-8">
                        {group.label}
                      </td>
                      {group.chars.map((c, ci) => (
                        <td key={ci} className="p-1">
                          {c ? (
                            <button
                              onClick={() => handleCellClick(c)}
                              className={`w-full rounded-lg px-2 py-3 transition-colors cursor-pointer hover:bg-border/50 ${
                                highlighted === c.char ? 'ring-2 ring-accent' : ''
                              } ${MASTERY_COLORS[getMasteryLevel(progress, langCode, activeTabId, c.char)]}`}
                            >
                              <div className="text-2xl font-serif">{c.char}</div>
                              <div className="text-xs text-text-muted mt-1">{c.romaji}</div>
                            </button>
                          ) : (
                            <div className="w-full px-2 py-3" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            // Flowing grid for non-table scripts
            <div>
              {activeTab.groups.map((group, gi) => (
                <div key={gi} className="mb-6">
                  {group.label && (
                    <h3 className="text-sm font-medium text-text-muted mb-2">{group.label}</h3>
                  )}
                  <div className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-11 gap-2">
                    {group.chars.filter(Boolean).map((c) => (
                      <button
                        key={c.char}
                        onClick={() => handleCellClick(c)}
                        title={c.note ? `${c.romaji ? c.romaji + ' — ' : ''}${c.note}` : c.romaji}
                        className={`rounded-lg px-2 py-3 transition-colors cursor-pointer hover:bg-border/50 text-center ${
                          highlighted === c.char ? 'ring-2 ring-accent' : ''
                        } ${MASTERY_COLORS[getMasteryLevel(progress, langCode, activeTabId, c.char)]}`}
                      >
                        <div className="text-2xl font-serif">{c.char}</div>
                        <div className="text-xs text-text-muted mt-1">{c.romaji || c.note}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quiz mode */}
      {mode === 'quiz' && activeTab && (
        <div className="max-w-2xl mx-auto">
          {!quizChar ? (
            <Card className="p-8 text-center">
              <p className="text-text-muted">Loading quiz...</p>
            </Card>
          ) : (
            <Card className="p-5">
              {/* Quiz type label + due count */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wide text-text-muted">
                  {quizType === 'char_to_romaji' && 'What is the romanization?'}
                  {quizType === 'romaji_to_char' && 'Pick the correct character'}
                  {quizType === 'sound_to_char' && 'Pick the character you heard'}
                </p>
                <p className="text-xs text-text-muted">
                  {dueChars.length} due
                </p>
              </div>

              {/* Prompt */}
              <div className="flex items-center justify-center py-2">
                {quizType === 'char_to_romaji' && (
                  <div className="text-center">
                    <div className="text-5xl font-serif">{quizChar.char}</div>
                    {speechSupported() && (
                      <button
                        onClick={() => handleSpeak(quizChar)}
                        className="text-xs text-accent hover:text-accent-hover mt-1"
                      >
                        Play sound
                      </button>
                    )}
                  </div>
                )}

                {quizType === 'romaji_to_char' && (
                  <div className="text-center">
                    <div className="text-2xl font-semibold">{quizChar.romaji}</div>
                    {quizChar.note && (
                      <div className="text-xs text-text-muted mt-0.5">{quizChar.note}</div>
                    )}
                  </div>
                )}

                {quizType === 'sound_to_char' && (
                  <button
                    onClick={() => handleSpeak(quizChar)}
                    className="px-5 py-2.5 rounded-lg bg-surface hover:bg-border/50 transition-colors text-lg"
                  >
                    Play again
                  </button>
                )}
              </div>

              {/* Answer area */}
              <div className="mt-3">
                {quizType === 'char_to_romaji' ? (
                  <div className="flex justify-center">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!quizRevealed) checkTypingAnswer();
                      }}
                      className="flex gap-2"
                    >
                      <input
                        ref={inputRef}
                        type="text"
                        value={quizInput}
                        onChange={(e) => setQuizInput(e.target.value)}
                        placeholder="Type romanization..."
                        disabled={quizRevealed}
                        className="px-3 py-1.5 border border-border rounded-lg text-center text-base bg-bg w-44 focus:outline-none focus:ring-2 focus:ring-accent/50"
                        autoComplete="off"
                      />
                      {!quizRevealed && (
                        <Button type="submit" size="sm" disabled={!quizInput.trim()}>
                          Check
                        </Button>
                      )}
                    </form>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto">
                    {quizOptions.map((opt) => {
                      let btnClass = 'border border-border hover:bg-border/50';
                      if (quizRevealed) {
                        if (opt.char === quizChar.char) {
                          btnClass = 'border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30';
                        } else if (quizCorrect === false) {
                          btnClass = 'border border-border opacity-50';
                        }
                      }
                      return (
                        <button
                          key={opt.char}
                          onClick={() => checkPickAnswer(opt)}
                          disabled={quizRevealed}
                          className={`rounded-lg px-3 py-2.5 text-center transition-colors ${btnClass}`}
                        >
                          <div className="text-2xl font-serif">{opt.char}</div>
                          {quizRevealed && (
                            <div className="text-[10px] text-text-muted">{opt.romaji}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Feedback + SRS rating */}
              {quizRevealed && (
                <div className="mt-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className={`text-sm font-medium ${quizCorrect ? 'text-emerald-600' : 'text-red-600'}`}>
                      {quizCorrect ? 'Correct!' : 'Incorrect'}
                    </span>
                    <span className="text-text-muted">—</span>
                    <span className="text-2xl font-serif">{quizChar.char}</span>
                    <span className="text-text-muted">=</span>
                    <span className="text-sm">{quizChar.romaji || quizChar.note}</span>
                    {quizChar.note && quizChar.romaji && (
                      <span className="text-xs text-text-muted">({quizChar.note})</span>
                    )}
                    {speechSupported() && (
                      <button
                        onClick={() => handleSpeak(quizChar)}
                        className="text-xs text-accent hover:text-accent-hover"
                      >
                        Play
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => handleRate('again')}>
                      Again
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleRate('hard')}>
                      Hard
                    </Button>
                    <Button size="sm" onClick={() => handleRate('good')}>
                      Good
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => handleRate('easy')}>
                      Easy
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Progress mode */}
      {mode === 'progress' && activeTab && (
        <div>
          <Card className="p-5 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">
                  <span className="font-medium">{learnedCount}</span>
                  <span className="text-text-muted"> / {allChars.length} characters reviewed</span>
                </p>
                <p className="text-sm text-text-muted mt-1">
                  {dueChars.length > 0
                    ? `${dueChars.length} due for review now`
                    : nextDue
                      ? `Next review ${formatDue(nextDue)}`
                      : 'No characters reviewed yet'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={handleReset}>
                Reset progress
              </Button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-surface border border-border" />
                Not seen
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700" />
                Learning
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700" />
                Mastered
              </span>
            </div>
          </Card>

          {/* Character mastery grid */}
          {activeTab.groups.map((group, gi) => (
            <div key={gi} className="mb-6">
              {group.label && (
                <h3 className="text-sm font-medium text-text-muted mb-2">{group.label}</h3>
              )}
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                {group.chars.filter(Boolean).map((c) => {
                  const mastery = getMasteryLevel(progress, langCode, activeTabId, c.char);
                  const p = getCharProgress(progress, langCode, activeTabId, c.char);
                  return (
                    <div
                      key={c.char}
                      className={`rounded-lg px-1 py-2 text-center ${MASTERY_COLORS[mastery]} ${MASTERY_RING[mastery]}`}
                      title={
                        (p.stats.lastReviewedAt
                          ? `${c.romaji || c.note} \u2014 ${p.stats.repetitions} reviews, interval: ${p.stats.interval}d`
                          : `${c.romaji || c.note} \u2014 not reviewed`)
                        + (c.note && c.romaji ? `\n${c.note}` : '')
                      }
                    >
                      <div className="text-xl font-serif">{c.char}</div>
                      <div className="text-[10px] text-text-muted mt-0.5">{c.romaji || c.note}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
