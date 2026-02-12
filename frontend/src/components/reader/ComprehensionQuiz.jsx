import { useState } from 'react';
import { generateComprehension, evaluateComprehension } from '../../api/client';
import Spinner from '../ui/Spinner';
import Button from '../ui/Button';

export default function ComprehensionQuiz({ projectId, currentLevel, onClose }) {
  const [state, setState] = useState('idle');
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [scores, setScores] = useState([]);

  async function handleStart() {
    setState('loading');
    try {
      const data = await generateComprehension(projectId, currentLevel);
      setQuestions(data.questions);
      setQIndex(0);
      setScores([]);
      setInput('');
      setFeedback(null);
      setState('question');
    } catch {
      setState('idle');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim()) return;
    setState('evaluating');
    try {
      const data = await evaluateComprehension(
        projectId,
        questions[qIndex],
        input.trim(),
        currentLevel
      );
      setFeedback(data);
      setScores((prev) => [...prev, data.correct]);
      setState('feedback');
    } catch {
      setFeedback({ correct: false, feedback: 'Failed to evaluate. Please try again.' });
      setState('feedback');
    }
  }

  function handleNext() {
    if (qIndex + 1 >= questions.length) {
      setState('complete');
    } else {
      setQIndex((i) => i + 1);
      setInput('');
      setFeedback(null);
      setState('question');
    }
  }

  function handleRetry() {
    setState('idle');
    setQuestions([]);
    setScores([]);
    setInput('');
    setFeedback(null);
  }

  const correctCount = scores.filter(Boolean).length;

  return (
    <div className="w-96 border-l border-border flex flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium">Comprehension Quiz</span>
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text">
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {state === 'idle' && (
          <div className="text-center py-8">
            <p className="text-sm text-text-muted mb-4">
              Test your understanding of the text at level {currentLevel}.
            </p>
            <Button onClick={handleStart}>Start Quiz</Button>
          </div>
        )}

        {state === 'loading' && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}

        {(state === 'question' || state === 'evaluating') && (
          <div>
            <div className="text-xs text-text-muted mb-3">
              Question {qIndex + 1} of {questions.length}
            </div>
            <p className="text-sm font-medium mb-4 leading-relaxed">{questions[qIndex]}</p>
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Your answer..."
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-bg focus:outline-none focus:ring-2 focus:ring-accent/50 mb-3"
                disabled={state === 'evaluating'}
                autoFocus
              />
              <Button type="submit" disabled={!input.trim() || state === 'evaluating'}>
                {state === 'evaluating' ? <Spinner size="sm" /> : 'Submit'}
              </Button>
            </form>
          </div>
        )}

        {state === 'feedback' && feedback && (
          <div>
            <div className="text-xs text-text-muted mb-3">
              Question {qIndex + 1} of {questions.length}
            </div>
            <p className="text-sm font-medium mb-3 leading-relaxed">{questions[qIndex]}</p>
            <div className="text-sm text-text-muted mb-2 italic">
              Your answer: {input}
            </div>
            <div
              className={`p-3 rounded-lg mb-4 text-sm ${
                feedback.correct
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300'
              }`}
            >
              <div className="font-medium mb-1">
                {feedback.correct ? 'Correct!' : 'Not quite'}
              </div>
              {feedback.feedback}
            </div>
            <Button onClick={handleNext}>
              {qIndex + 1 >= questions.length ? 'See Results' : 'Next Question'}
            </Button>
          </div>
        )}

        {state === 'complete' && (
          <div className="text-center py-8">
            <div className="text-3xl font-semibold mb-2">
              {correctCount}/{questions.length}
            </div>
            <p className="text-sm text-text-muted mb-6">
              {correctCount === questions.length
                ? 'Perfect score! Great comprehension.'
                : correctCount >= questions.length / 2
                  ? 'Good work! Keep practicing.'
                  : 'Keep reading and try again.'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="secondary" onClick={onClose}>Close</Button>
              <Button onClick={handleRetry}>Try Again</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
