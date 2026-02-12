import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendReaderChat } from '../../api/client';
import Spinner from '../ui/Spinner';

const markdownComponents = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
  li: ({ children }) => <li className="mb-0.5">{children}</li>,
  code: ({ inline, children }) =>
    inline ? (
      <code className="bg-surface px-1 rounded text-xs">{children}</code>
    ) : (
      <pre className="bg-surface p-2 rounded text-xs overflow-x-auto mb-2">
        <code>{children}</code>
      </pre>
    ),
  table: ({ children }) => (
    <table className="text-xs border-collapse w-full mb-2">{children}</table>
  ),
  thead: ({ children }) => <thead className="bg-surface">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b border-border/50">{children}</tr>,
  th: ({ children }) => (
    <th className="text-left px-2 py-1 font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="px-2 py-1">{children}</td>,
};

export default function ReaderChat({
  projectId,
  currentLevel,
  initialMessage,
  onClose,
  messages,
  setMessages,
}) {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const sentInitialRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const doSend = useCallback(async (text) => {
    const userMsg = text.trim();
    if (!userMsg) return;

    const newMessages = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setInput('');
    setSending(true);

    try {
      const data = await sendReaderChat(projectId, userMsg, currentLevel, null, messages);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setSending(false);
    }
  }, [messages, setMessages, projectId, currentLevel]);

  // Handle initialMessage (from double-click) — guard against duplicate sends
  useEffect(() => {
    if (initialMessage && initialMessage !== sentInitialRef.current && !sending) {
      sentInitialRef.current = initialMessage;
      doSend(initialMessage);
    }
  }, [initialMessage, doSend, sending]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    doSend(input);
  }

  function handleClear() {
    setMessages([]);
    sentInitialRef.current = null;
    inputRef.current?.focus();
  }

  return (
    <div className="w-96 border-l border-border flex flex-col bg-bg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-medium">Ask about this text</span>
        <div className="flex gap-2">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="text-xs text-text-muted hover:text-text"
            >
              Clear
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs text-text-muted hover:text-text"
          >
            Close
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-text-muted">
            Ask about grammar, vocabulary, or pronunciation. Double-click any word to ask about it.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent text-white'
                  : 'bg-surface text-text'
              }`}
            >
              {msg.role === 'assistant' ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
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
            <div className="px-3 py-2 bg-surface rounded-lg">
              <Spinner size="sm" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 px-4 py-3 border-t border-border">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
