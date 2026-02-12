import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useUser } from '../context/UserContext';
import {
  startAssessment,
  sendAssessmentMessage,
  getAssessments,
  getAssessment,
  deleteAssessment,
} from '../api/client';
import { LANGUAGE_LIST, nameFor } from '../languages';
import Flag from '../components/ui/Flag';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import PageLayout from '../components/layout/PageLayout';

export default function Assessment() {
  const { currentUser, updateCurrentUser } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resumeId = searchParams.get('session');

  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [resultLevel, setResultLevel] = useState(null);
  const [sessionLang, setSessionLang] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(!resumeId);
  const [deletingHistoryId, setDeletingHistoryId] = useState(null);
  const bottomRef = useRef(null);

  // Load assessment history
  useEffect(() => {
    if (!currentUser) return;
    getAssessments(currentUser.id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [currentUser, completed]);

  // Resume existing session
  useEffect(() => {
    if (!currentUser) return;
    if (resumeId) {
      getAssessment(resumeId)
        .then((session) => {
          setSessionId(session.id);
          setSessionLang(session.target_language);
          const msgs = (session.messages || []).filter(
            (m, i) => !(i === 0 && m.role === 'user' && m.content.includes("I'd like to find out my level"))
          );
          setMessages(msgs);
          setCompleted(session.completed);
          setResultLevel(session.result_level);
          setShowHistory(false);
        })
        .catch((err) => {
          console.error('Failed to load session:', err);
          setShowHistory(true);
        });
    }
  }, [currentUser, resumeId]);

  function startNew(langCode) {
    if (!currentUser || !langCode) return;
    setShowHistory(false);
    setMessages([]);
    setCompleted(false);
    setResultLevel(null);
    setSessionId(null);
    setSessionLang(langCode);

    startAssessment(currentUser.id, langCode)
      .then((data) => {
        setSessionId(data.session_id);
        if (data.message) {
          setMessages([{ role: 'assistant', content: data.message }]);
        }
      })
      .catch((err) => {
        console.error('Failed to start assessment:', err);
        setMessages([{
          role: 'assistant',
          content: 'Could not start the assessment. Please try again later.',
        }]);
      });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleDeleteHistory(sessionIdToDelete) {
    if (!window.confirm('Delete this assessment session?')) return;
    setDeletingHistoryId(sessionIdToDelete);
    try {
      await deleteAssessment(sessionIdToDelete);
      setHistory((prev) => prev.filter((s) => s.id !== sessionIdToDelete));
    } catch (err) {
      console.error('Failed to delete assessment:', err);
    } finally {
      setDeletingHistoryId(null);
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setSending(true);

    try {
      const data = await sendAssessmentMessage(sessionId, userMsg);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.response },
      ]);
      if (data.completed) {
        setCompleted(true);
        setResultLevel(data.level);
        // Update user's levels dict
        const updatedLevels = { ...(currentUser.levels || {}) };
        updatedLevels[sessionLang] = data.level;
        updateCurrentUser({ ...currentUser, levels: updatedLevels });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setSending(false);
    }
  }

  if (!currentUser) {
    return (
      <PageLayout>
        <p className="text-text-muted">Select a user to begin the assessment.</p>
      </PageLayout>
    );
  }

  // Language selection screen
  if (showHistory && !sessionId) {
    return (
      <PageLayout>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl font-semibold mb-1">Level assessment</h1>
            <p className="text-sm text-text-muted">
              Choose a language and chat naturally &mdash; we&rsquo;ll figure out your level.
            </p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-text-muted hover:text-text"
          >
            Skip &rarr;
          </button>
        </div>

        <div className="mb-8">
          <h2 className="text-sm font-medium text-text-muted mb-3">Start new assessment</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {LANGUAGE_LIST.map((lang) => {
              const userLevel = (currentUser.levels || {})[lang.code];
              return (
                <button
                  key={lang.code}
                  onClick={() => startNew(lang.code)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-surface hover:bg-border/50 transition-colors text-left"
                >
                  <Flag code={lang.code} size="lg" />
                  <div>
                    <div className="text-sm font-medium">{lang.name}</div>
                    {userLevel != null && (
                      <div className="text-xs text-text-muted">Level {userLevel}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {history.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-text-muted mb-3">Past assessments</h2>
            <div className="space-y-2">
              {history.map((s) => (
                <div
                  key={s.id}
                  className="w-full px-4 py-3 rounded-lg bg-surface hover:bg-border/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => navigate(`/assessment?session=${s.id}`)}
                      className="flex-1 text-left"
                    >
                      <span className="text-sm">
                        <Flag code={s.target_language} size="sm" /> {nameFor(s.target_language)}{' '}
                        <span className="text-text-muted">
                          &middot; {new Date(s.created_at).toLocaleDateString()}
                        </span>
                      </span>
                      <div className="text-xs mt-0.5">
                        {s.completed ? (
                          <span className="text-emerald-600">Level {s.result_level}</span>
                        ) : (
                          <span className="text-text-muted">In progress</span>
                        )}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteHistory(s.id)}
                      disabled={deletingHistoryId === s.id}
                      className="text-xs text-text-muted hover:text-red-600 disabled:opacity-50"
                    >
                      {deletingHistoryId === s.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </PageLayout>
    );
  }

  return (
    <PageLayout className="flex flex-col h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-semibold mb-1">
            <Flag code={sessionLang} /> Level assessment
          </h1>
          <p className="text-sm text-text-muted">
            Chat naturally &mdash; we&rsquo;ll figure out your {nameFor(sessionLang)} level.
          </p>
        </div>
        <div className="flex gap-3">
          {history.length > 0 && (
            <button
              onClick={() => { setSessionId(null); setMessages([]); setShowHistory(true); setSessionLang(null); }}
              className="text-sm text-text-muted hover:text-text"
            >
              History
            </button>
          )}
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-text-muted hover:text-text"
          >
            Skip &rarr;
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-md px-4 py-2.5 rounded-lg text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent text-white'
                  : 'bg-surface text-text'
              }`}
            >
              {msg.role === 'assistant' ? (
                <ReactMarkdown
                  components={{
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="italic">{children}</em>,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="px-4 py-2.5 bg-surface rounded-lg">
              <Spinner size="sm" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {completed ? (
        <div className="text-center py-6 border-t border-border">
          <p className="text-lg font-medium mb-1">
            <Flag code={sessionLang} /> Your {nameFor(sessionLang)} level: {resultLevel}
          </p>
          <p className="text-sm text-text-muted mb-1">
            Your texts will start transforming from level {resultLevel}, so the
            early sections will already feel familiar.
          </p>
          <p className="text-xs text-text-muted mb-4">
            You can retake the assessment anytime to update your level.
          </p>
          <Button onClick={() => navigate('/dashboard')}>
            Go to dashboard
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="flex gap-2 border-t border-border pt-4">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your response..."
            className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            disabled={sending || !sessionId}
          />
          <Button type="submit" disabled={sending || !input.trim()}>
            Send
          </Button>
        </form>
      )}
    </PageLayout>
  );
}
