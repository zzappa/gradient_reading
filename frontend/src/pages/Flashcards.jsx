import { useEffect, useMemo, useRef, useState } from 'react';
import PageLayout from '../components/layout/PageLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { sendReaderChat } from '../api/client';
import {
  deleteFlashcard,
  formatSchemaLabel,
  getDueFlashcards,
  getNextDueAt,
  loadFlashcards,
  reviewFlashcard,
  saveFlashcards,
} from '../utils/flashcards';
import { LANGUAGE_LIST, nameFor } from '../languages';
import { useUser } from '../context/UserContext';
import { levelToCefr } from '../utils/cefr';
import { isSupported as speechSupported, speak, speakTerm, stop } from '../utils/speech';

const SCHEMA_OPTIONS = ['en_target', 'target_en', 'substitution'];
const GENERIC_SUBSTITUTION_PROMPT = 'Replace the highlighted target word with English.';

function makeDraftId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptySubstitution(realScript = '') {
  const target = (realScript || '').trim() || 'the target word';
  return {
    variant: 'en_with_target',
    prompt: `Replace "${target}" with English.`,
    frontSentence: '',
    correctedSentence: '',
    answer: '',
    answerSide: 'en',
  };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSubstitutionPromptTarget(card) {
  const prompt = (card?.substitution?.prompt || '').trim();
  const match = prompt.match(/^Replace\s+"(.+?)"\s+with English\.?$/i);
  return match ? (match[1] || '').trim() : '';
}

function findCandidateInSentence(sentence, candidate) {
  const text = (sentence || '').trim();
  const needle = (candidate || '').trim();
  if (!text || !needle) return '';

  const wordLike = /^[\p{L}\p{M}0-9'’-]+$/u.test(needle);
  if (wordLike) {
    const tokenRe = /[\p{L}\p{M}0-9'’-]+/gu;
    const tokens = [];
    let match;
    while ((match = tokenRe.exec(text)) !== null) {
      const token = (match[0] || '').trim();
      tokens.push(token);
      if (token.toLowerCase() === needle.toLowerCase()) return token;
    }

    const needleLower = needle.toLowerCase();
    let bestToken = '';
    let bestScore = 0;
    for (const token of tokens) {
      const tokenLower = token.toLowerCase();
      if (tokenLower.length < 3 || needleLower.length < 4) continue;

      let prefix = 0;
      const limit = Math.min(tokenLower.length, needleLower.length);
      while (prefix < limit && tokenLower[prefix] === needleLower[prefix]) prefix += 1;
      if (prefix < 2) continue;

      const rows = tokenLower.length + 1;
      const cols = needleLower.length + 1;
      const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
      for (let i = 0; i < rows; i += 1) dp[i][0] = i;
      for (let j = 0; j < cols; j += 1) dp[0][j] = j;
      for (let i = 1; i < rows; i += 1) {
        for (let j = 1; j < cols; j += 1) {
          const cost = tokenLower[i - 1] === needleLower[j - 1] ? 0 : 1;
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + cost
          );
        }
      }

      const distance = dp[rows - 1][cols - 1];
      const similarity = 1 - (distance / Math.max(tokenLower.length, needleLower.length));
      const score = similarity + Math.min(prefix, 4) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestToken = token;
      }
    }

    if (bestScore >= 0.72) return bestToken;
  }

  const pattern = new RegExp(escapeRegExp(needle), 'i');
  const match = text.match(pattern);
  return match ? (match[0] || '').trim() : '';
}

function findSubstitutionNeedle(card, sentence) {
  const text = (sentence || '').trim();
  if (!text) return '';

  const promptTarget = extractSubstitutionPromptTarget(card);
  const fallbackCandidates = [card?.realScript, card?.romanization, card?.term]
    .map((v) => (v || '').trim())
    .filter(Boolean)
    .filter(
      (value, idx, arr) =>
        arr.findIndex((x) => x.toLowerCase() === value.toLowerCase()) === idx
    )
    .sort((a, b) => b.length - a.length);

  const candidates = [
    ...(promptTarget ? [promptTarget] : []),
    ...fallbackCandidates.filter(
      (value) => !promptTarget || value.toLowerCase() !== promptTarget.toLowerCase()
    ),
  ];

  for (const candidate of candidates) {
    const match = findCandidateInSentence(text, candidate);
    if (match) return match;
  }
  return '';
}

function buildSubstitutionPromptText(card) {
  const sentence = card?.substitution?.frontSentence || '';
  const target = findSubstitutionNeedle(card, sentence);
  return target ? `Replace "${target}" with English.` : GENERIC_SUBSTITUTION_PROMPT;
}

function renderSubstitutionSentence(card, sentence) {
  const text = sentence || '';
  if (!text) return '';

  const needle = findSubstitutionNeedle(card, text);
  if (!needle) return text;

  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, 'gi'));
  if (parts.length === 1) return text;

  return parts.map((part, idx) => {
    if (part.toLowerCase() !== needle.toLowerCase()) {
      return <span key={`txt-${idx}`}>{part}</span>;
    }
    return (
      <span key={`hit-${idx}`} className="text-emerald-600 font-semibold">
        {part}
      </span>
    );
  });
}

function normalizeSubstitutionAnswerText(value) {
  return (value || '')
    .replace(/\([^)]*\)|\[[^\]]*]|{[^}]*}/g, ' ')
    .split(/[\/;,]/)
    .map((part) => part.trim())
    .filter(Boolean)[0] || '';
}

function sanitizeCorrectSentenceForDisplay(sentence, preferredAnswer) {
  const text = (sentence || '').trim();
  if (!text) return text;
  const preferred = normalizeSubstitutionAnswerText(preferredAnswer);
  const optionRe = /([A-Za-zÀ-ÖØ-öø-ÿ\u0400-\u04FF'-]{1,24})\s*\/\s*([A-Za-zÀ-ÖØ-öø-ÿ\u0400-\u04FF'-]{1,24})(?:\s*\([^)]*\))?/gi;
  return text
    .replace(optionRe, () => preferred || '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

function findSubstitutionAnswerNeedle(card, sentence) {
  const text = (sentence || '').trim();
  if (!text) return '';

  const clean = (value) => (value || '')
    .replace(/\([^)]*\)|\[[^\]]*]|{[^}]*}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const candidates = [
    normalizeSubstitutionAnswerText(card?.substitution?.answer),
    normalizeSubstitutionAnswerText(card?.translation),
  ]
    .flatMap((v) => (v || '').split(/[\/;,]/))
    .map(clean)
    .filter(Boolean)
    .filter((v, i, arr) => arr.findIndex((x) => x.toLowerCase() === v.toLowerCase()) === i)
    .sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    const match = findCandidateInSentence(text, candidate);
    if (match) return match;
  }
  return '';
}

function renderSubstitutionAnswerSentence(card, sentence) {
  const text = sentence || '';
  if (!text) return '';

  const needle = findSubstitutionAnswerNeedle(card, text);
  if (!needle) return text;

  const parts = text.split(new RegExp(`(${escapeRegExp(needle)})`, 'gi'));
  if (parts.length === 1) return text;

  return parts.map((part, idx) => {
    if (part.toLowerCase() !== needle.toLowerCase()) {
      return <span key={`txt-${idx}`}>{part}</span>;
    }
    return (
      <span key={`ans-${idx}`} className="text-emerald-600 font-semibold">
        {part}
      </span>
    );
  });
}

function TargetWordBlock({ realScript, ipa, romanization }) {
  return (
    <div className="text-center py-2">
      <div className="font-serif text-4xl leading-tight">{realScript}</div>
      {ipa && (
        <div className="text-sm text-text-muted mt-2">{ipa}</div>
      )}
      <div className="text-sm text-text-muted mt-1">{romanization}</div>
    </div>
  );
}

function renderFront(card) {
  if (card.schema === 'target_en') {
    return (
      <>
        <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
          Target -&gt; EN
        </p>
        <TargetWordBlock
          realScript={card.realScript}
          ipa={card.ipa}
          romanization={card.romanization}
        />
      </>
    );
  }

  if (card.schema === 'substitution') {
    const substitution = card.substitution || {};
    const promptText = buildSubstitutionPromptText(card);
    return (
      <>
        <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
          Substitution
        </p>
        <p className="text-sm text-text-muted text-center mb-4">
          {promptText}
        </p>
        <p className="font-serif text-2xl leading-relaxed text-center">
          {renderSubstitutionSentence(card, substitution.frontSentence || '')}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
        EN -&gt; Target
      </p>
      <p className="font-serif text-4xl leading-tight text-center">
        {card.translation}
      </p>
    </>
  );
}

function renderBack(card) {
  if (card.schema === 'target_en') {
    return (
      <>
        <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
          Answer
        </p>
        <p className="font-serif text-4xl leading-tight text-center">
          {card.translation}
        </p>
      </>
    );
  }

  if (card.schema === 'substitution') {
    const substitution = card.substitution || {};
    const answerText = normalizeSubstitutionAnswerText(substitution.answer || card.translation);
    const correctedText = sanitizeCorrectSentenceForDisplay(
      substitution.correctedSentence || substitution.frontSentence || '',
      answerText
    );
    return (
      <>
        <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
          Answer
        </p>
        <p className="font-serif text-4xl leading-tight text-center mb-3 text-emerald-600 dark:text-emerald-400">
          {answerText || substitution.answer || card.translation}
        </p>
        <p className="text-sm text-text-muted text-center mt-3">
          Correct sentence:
        </p>
        <p className="font-serif text-lg leading-relaxed text-center mt-1">
          {renderSubstitutionAnswerSentence(
            card,
            correctedText
          )}
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
        Answer
      </p>
      <TargetWordBlock
        realScript={card.realScript}
        ipa={card.ipa}
        romanization={card.romanization}
      />
    </>
  );
}

function formatDue(value) {
  if (!value) return 'now';
  const delta = value - Date.now();
  if (delta <= 0) return 'now';
  if (delta < 60 * 60 * 1000) return `in ${Math.max(1, Math.round(delta / 60000))}m`;
  if (delta < 24 * 60 * 60 * 1000) return `in ${Math.round(delta / (60 * 60 * 1000))}h`;
  return `in ${Math.round(delta / (24 * 60 * 60 * 1000))}d`;
}

function formatDueAbsolute(value) {
  if (!value) return 'now';
  const dt = new Date(value);
  return dt.toLocaleString();
}

function cardContext(card) {
  if (!card) return null;

  if (card.schema === 'substitution') {
    const substitution = card.substitution || {};
    return [
      substitution.frontSentence ? `Sentence: ${substitution.frontSentence}` : null,
      substitution.correctedSentence ? `Reference sentence: ${substitution.correctedSentence}` : null,
      card.realScript ? `Word in target language: ${card.realScript}` : null,
      card.translation ? `English meaning: ${card.translation}` : null,
    ].filter(Boolean).join('\n');
  }

  return [
    card.realScript ? `Target word: ${card.realScript}` : null,
    card.romanization && card.romanization !== card.realScript
      ? `Romanization: ${card.romanization}`
      : null,
    card.ipa ? `IPA: ${card.ipa}` : null,
    card.translation ? `English: ${card.translation}` : null,
    card.grammarNote ? `Grammar note: ${card.grammarNote}` : null,
  ].filter(Boolean).join('\n');
}

function defaultQuestion(card) {
  if (!card) return '';
  if (card.schema === 'substitution') {
    return 'Explain this sentence and why this target word is used here.';
  }
  return `Explain the nuance, grammar, and usage of "${card.realScript || card.term}".`;
}

export default function Flashcards() {
  const { currentUser } = useUser();
  const [cards, setCards] = useState([]);
  const [mode, setMode] = useState('due');
  const [stackLanguage, setStackLanguage] = useState('');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [showBack, setShowBack] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);
  const [listQuery, setListQuery] = useState('');

  const [chatOpen, setChatOpen] = useState(false);
  const [chatCardId, setChatCardId] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatByCard, setChatByCard] = useState({});
  const chatBottomRef = useRef(null);
  const createMenuRef = useRef(null);

  useEffect(() => {
    setCards(loadFlashcards());
  }, []);

  useEffect(() => {
    setNowTick(Date.now());
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => stop(), []);

  useEffect(() => {
    if (!createMenuOpen) return undefined;
    function handleOutsideClick(event) {
      if (!createMenuRef.current) return;
      if (!createMenuRef.current.contains(event.target)) {
        setCreateMenuOpen(false);
      }
    }
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, [createMenuOpen]);

  const stackStats = useMemo(() => {
    const statsByLang = new Map();
    for (const card of cards) {
      const code = card.language || 'en';
      if (!statsByLang.has(code)) {
        statsByLang.set(code, { code, total: 0, due: 0 });
      }
      const stat = statsByLang.get(code);
      stat.total += 1;
      if ((card.dueAt || 0) <= nowTick) {
        stat.due += 1;
      }
    }
    return [...statsByLang.values()].sort((a, b) => nameFor(a.code).localeCompare(nameFor(b.code)));
  }, [cards, nowTick]);

  useEffect(() => {
    if (!stackStats.length) {
      if (stackLanguage) setStackLanguage('');
      return;
    }
    if (!stackStats.some((s) => s.code === stackLanguage)) {
      setStackLanguage(stackStats[0].code);
    }
  }, [stackStats, stackLanguage]);

  const activeStack = stackStats.find((s) => s.code === stackLanguage) || null;
  const stackCards = useMemo(() => {
    if (!activeStack) return [];
    return cards.filter((c) => c.language === activeStack.code);
  }, [cards, activeStack]);
  const dueCount = useMemo(() => getDueFlashcards(stackCards, nowTick).length, [stackCards, nowTick]);

  const queue = useMemo(() => {
    if (mode === 'list') return [];
    if (mode === 'all') {
      return [...stackCards].sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
    }
    return getDueFlashcards(stackCards, nowTick);
  }, [stackCards, mode, nowTick]);

  const allCards = useMemo(
    () => [...stackCards].sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0)),
    [stackCards]
  );

  const filteredList = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return allCards;
    return allCards.filter((c) =>
      [
        c.realScript,
        c.romanization,
        c.translation,
        c.term,
        c.language,
        formatSchemaLabel(c.schema),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [allCards, listQuery]);

  const nextDueAt = useMemo(() => getNextDueAt(stackCards), [stackCards]);

  useEffect(() => {
    if (mode === 'list') return;
    if (!queue.length) {
      setCurrentId(null);
      setShowBack(false);
      return;
    }
    if (!currentId || !queue.some((c) => c.id === currentId)) {
      setCurrentId(queue[0].id);
      setShowBack(false);
    }
  }, [queue, currentId, mode]);

  const currentCard = useMemo(
    () => queue.find((c) => c.id === currentId) || null,
    [queue, currentId]
  );

  const chatCard = useMemo(
    () => cards.find((c) => c.id === chatCardId) || null,
    [cards, chatCardId]
  );

  const chatMessages = chatCardId ? (chatByCard[chatCardId] || []) : [];

  useEffect(() => {
    if (!chatOpen) return;
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatOpen, chatCardId, chatMessages.length, chatSending]);

  function updateCards(next) {
    saveFlashcards(next);
    setCards(next);
  }

  function setActiveChatMessages(nextOrFn) {
    if (!chatCardId) return;
    setChatByCard((prev) => {
      const current = prev[chatCardId] || [];
      const next = typeof nextOrFn === 'function' ? nextOrFn(current) : nextOrFn;
      return { ...prev, [chatCardId]: next };
    });
  }

  function handleReview(rating) {
    if (!currentCard) return;
    const beforeIdx = queue.findIndex((c) => c.id === currentCard.id);
    const nextCandidate = queue[(beforeIdx + 1) % queue.length];

    const updated = reviewFlashcard(currentCard, rating);
    const nextCards = cards.map((c) => (c.id === updated.id ? updated : c));
    updateCards(nextCards);
    setShowBack(false);

    if (nextCandidate) {
      setCurrentId(nextCandidate.id);
    }
  }

  function openEdit(card = currentCard) {
    if (!card) return;
    setEditDraft(JSON.parse(JSON.stringify(card)));
    setEditOpen(true);
  }

  function openCreateCard(schema = 'en_target') {
    setCreateMenuOpen(false);
    const now = Date.now();
    const preferredLanguage = activeStack?.code || stackLanguage || 'es';
    const draft = {
      id: makeDraftId(),
      createdAt: now,
      updatedAt: now,
      dueAt: now,
      schema,
      language: preferredLanguage,
      termKey: '',
      term: '',
      realScript: '',
      romanization: '',
      ipa: '',
      translation: '',
      grammarNote: '',
      projectId: null,
      firstChapter: 0,
      substitution: schema === 'substitution' ? emptySubstitution() : null,
      stats: {
        repetitions: 0,
        interval: 0,
        ease: 2.5,
        lastReviewedAt: null,
      },
    };
    setEditDraft(draft);
    setEditOpen(true);
  }

  function openChat(card = currentCard) {
    if (!card) return;
    setChatCardId(card.id);
    if (!(chatByCard[card.id]?.length)) {
      setChatInput(defaultQuestion(card));
    } else {
      setChatInput('');
    }
    setChatOpen(true);
  }

  function openForStudy(card) {
    setMode('all');
    setCurrentId(card.id);
    setShowBack(false);
  }

  async function sendChatMessage() {
    if (!chatCard || !chatInput.trim() || chatSending) return;

    const message = chatInput.trim();
    const history = chatMessages;
    setChatInput('');

    setActiveChatMessages((prev) => [...prev, { role: 'user', content: message }]);

    if (!chatCard.projectId) {
      setActiveChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'This card is missing project context, so model chat is unavailable for it.',
        },
      ]);
      return;
    }

    setChatSending(true);
    try {
      const level = Number.isFinite(chatCard.firstChapter) ? chatCard.firstChapter : 7;
      const cefr = chatCard.language && currentUser?.levels?.[chatCard.language] != null
        ? levelToCefr(currentUser.levels[chatCard.language])
        : null;
      const data = await sendReaderChat(
        chatCard.projectId,
        message,
        level,
        cardContext(chatCard),
        history,
        cefr
      );
      setActiveChatMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setActiveChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err?.message || 'Something went wrong. Please try again.',
        },
      ]);
    } finally {
      setChatSending(false);
    }
  }

  function saveEdit() {
    if (!editDraft) return;
    const base = cards.find((c) => c.id === editDraft.id);
    const now = Date.now();
    const normalizedTerm = (
      editDraft.term ||
      editDraft.romanization ||
      editDraft.realScript ||
      ''
    ).trim();
    const schema = editDraft.schema || 'en_target';
    const language = editDraft.language || activeStack?.code || 'es';

    const updated = {
      ...base,
      ...editDraft,
      schema,
      language,
      term: normalizedTerm,
      termKey: (editDraft.termKey || normalizedTerm).toLowerCase().trim(),
      substitution: schema === 'substitution'
        ? {
          ...emptySubstitution(editDraft.realScript || normalizedTerm),
          ...(editDraft.substitution || {}),
          answerSide: 'en',
        }
        : null,
      updatedAt: now,
      createdAt: base?.createdAt || editDraft.createdAt || now,
      dueAt: base?.dueAt || editDraft.dueAt || now,
      stats: base?.stats || editDraft.stats || {
        repetitions: 0,
        interval: 0,
        ease: 2.5,
        lastReviewedAt: null,
      },
    };
    if (schema === 'substitution') {
      updated.substitution = {
        ...(updated.substitution || {}),
        prompt: buildSubstitutionPromptText(updated),
      };
    }

    const next = base
      ? cards.map((c) => (c.id === updated.id ? updated : c))
      : [updated, ...cards];

    updateCards(next);
    setEditOpen(false);
    if (!base) {
      setMode('all');
      setCurrentId(updated.id);
      setShowBack(false);
    }
  }

  function deleteEditingCard() {
    if (!editDraft) return;
    const exists = cards.some((c) => c.id === editDraft.id);
    if (!exists) {
      setEditOpen(false);
      return;
    }
    if (!window.confirm('Delete this flashcard?')) return;
    const next = deleteFlashcard(editDraft.id);
    setCards(next);
    setEditOpen(false);
    setShowBack(false);
    if (chatCardId === editDraft.id) {
      setChatOpen(false);
      setChatCardId(null);
      setChatInput('');
      setChatSending(false);
    }
  }

  function playWordAudio() {
    if (!currentCard || !speechSupported()) return;
    if (currentCard.language === 'en') return;

    const display = currentCard.romanization || currentCard.term || currentCard.realScript;
    const native = currentCard.realScript && currentCard.realScript !== display
      ? currentCard.realScript
      : null;
    speakTerm(display, currentCard.language, native);
  }

  function playSentenceAudio() {
    if (!currentCard || currentCard.schema !== 'substitution' || !speechSupported()) return;
    const sentence = currentCard.substitution?.frontSentence || '';
    if (!sentence.trim()) return;
    speak(sentence, currentCard.language || 'en', { rate: 0.9 });
  }

  return (
    <PageLayout wide>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Flashcards</h1>
          <p className="text-sm text-text-muted mt-1">
            Anki-style review for dictionary terms
            {activeStack && ` · Stack: ${nameFor(activeStack.code)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={createMenuRef}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreateMenuOpen((open) => !open)}
            >
              Create flashcard
            </Button>
            {createMenuOpen && (
              <div className="absolute right-0 mt-1 w-44 rounded-lg border border-border bg-bg shadow-lg z-20 py-1">
                {SCHEMA_OPTIONS.map((schema) => (
                  <button
                    key={schema}
                    onClick={() => openCreateCard(schema)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface"
                  >
                    {formatSchemaLabel(schema)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            variant={mode === 'due' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setMode('due');
              setShowBack(false);
            }}
          >
            Due ({dueCount})
          </Button>
          <Button
            variant={mode === 'all' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setMode('all');
              setShowBack(false);
            }}
          >
            Study all ({stackCards.length})
          </Button>
          <Button
            variant={mode === 'list' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setMode('list');
              setShowBack(false);
            }}
          >
            All cards
          </Button>
        </div>
      </div>

      {stackStats.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {stackStats.map((stack) => (
            <button
              key={stack.code}
              onClick={() => {
                setStackLanguage(stack.code);
                setShowBack(false);
              }}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                stack.code === activeStack?.code
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-muted hover:text-text hover:border-accent/50'
              }`}
            >
              <span className="font-medium">{nameFor(stack.code)}</span>
              <span className="ml-2 text-xs opacity-80">
                {stack.total} · due {stack.due}
              </span>
            </button>
          ))}
        </div>
      )}

      {!cards.length ? (
        <Card className="p-8 text-center">
          <p className="text-text-muted">
            No flashcards yet. Create cards from Dictionary rows.
          </p>
        </Card>
      ) : mode === 'list' ? (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-text-muted">
              {filteredList.length} of {stackCards.length} cards
              {activeStack && ` in ${nameFor(activeStack.code)}`}
            </div>
            <input
              type="text"
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Search cards..."
              className="px-3 py-1.5 border border-border rounded-lg text-sm bg-bg min-w-[240px]"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left">
                <tr>
                  <th className="px-3 py-2 font-medium text-text-muted">Word</th>
                  <th className="px-3 py-2 font-medium text-text-muted">English</th>
                  <th className="px-3 py-2 font-medium text-text-muted">Schema</th>
                  <th className="px-3 py-2 font-medium text-text-muted">Language</th>
                  <th className="px-3 py-2 font-medium text-text-muted">Due</th>
                  <th className="px-3 py-2 font-medium text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((card) => (
                  <tr key={card.id} className="border-t border-border/50 align-top">
                    <td className="px-3 py-2 min-w-[220px]">
                      <div className="font-medium">{card.realScript}</div>
                      {card.romanization && card.romanization !== card.realScript && (
                        <div className="text-xs text-text-muted mt-0.5">{card.romanization}</div>
                      )}
                      {card.ipa && (
                        <div className="text-xs text-text-muted mt-0.5">{card.ipa}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">{card.translation || '—'}</td>
                    <td className="px-3 py-2">{formatSchemaLabel(card.schema)}</td>
                    <td className="px-3 py-2">{nameFor(card.language)}</td>
                    <td className="px-3 py-2 text-text-muted">{formatDueAbsolute(card.dueAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openForStudy(card)}>
                          Study
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(card)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openChat(card)}>
                          Ask Claude
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-text-muted">
                      No cards match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : !queue.length ? (
        <Card className="p-8 text-center">
          <p className="text-text-muted">
            No cards due right now
            {activeStack && ` for ${nameFor(activeStack.code)}`}.
          </p>
          {nextDueAt && (
            <p className="text-sm text-text-muted mt-2">
              Next due {formatDue(nextDueAt)}.
            </p>
          )}
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setMode('all')}>
              Study all cards
            </Button>
          </div>
        </Card>
      ) : (
        <div className="max-w-4xl mx-auto">
          <Card className="p-6">
            {currentCard && (
              <>
                <div className="flex items-center justify-between mb-5 gap-3">
                  <div className="text-sm text-text-muted">
                    {nameFor(currentCard.language)} &middot; {formatSchemaLabel(currentCard.schema)}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {speechSupported() && currentCard.schema === 'substitution' && (
                      <Button variant="secondary" size="sm" onClick={playSentenceAudio}>
                        Play sentence
                      </Button>
                    )}
                    {speechSupported() && currentCard.language !== 'en' && (
                      <Button variant="secondary" size="sm" onClick={playWordAudio}>
                        Play word
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={() => openChat(currentCard)}>
                      Ask Claude
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(currentCard)}>
                      Edit
                    </Button>
                    <div className="text-xs text-text-muted">
                      {queue.findIndex((c) => c.id === currentCard.id) + 1}/{queue.length}
                    </div>
                  </div>
                </div>

                <div className="min-h-[260px] flex items-center justify-center px-2">
                  <div className="w-full">
                    {showBack ? renderBack(currentCard) : renderFront(currentCard)}
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-center gap-2">
                  {!showBack ? (
                    <Button size="lg" onClick={() => setShowBack(true)}>
                      Show answer
                    </Button>
                  ) : (
                    <>
                      <Button variant="secondary" onClick={() => handleReview('again')}>
                        Again
                      </Button>
                      <Button variant="secondary" onClick={() => handleReview('hard')}>
                        Hard
                      </Button>
                      <Button onClick={() => handleReview('good')}>
                        Good
                      </Button>
                      <Button variant="secondary" onClick={() => handleReview('easy')}>
                        Easy
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {chatOpen && chatCard && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-3xl h-[78vh] p-0 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <div className="font-medium">Ask Claude</div>
                <div className="text-xs text-text-muted mt-0.5">
                  {chatCard.realScript} &middot; {formatSchemaLabel(chatCard.schema)}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setChatOpen(false)}>
                Close
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-bg">
              {chatMessages.length === 0 && (
                <p className="text-sm text-text-muted">
                  Ask about grammar, meaning, pronunciation, or sentence usage for this card.
                </p>
              )}
              {chatMessages.map((msg, i) => (
                <div
                  key={`${chatCardId}-${i}`}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[86%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-accent text-white'
                        : 'bg-surface text-text'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {chatSending && (
                <div className="flex justify-start">
                  <div className="px-3 py-2 bg-surface rounded-lg">
                    <Spinner size="sm" />
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            <div className="border-t border-border p-3 bg-bg">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setActiveChatMessages([])}
                  className="text-xs text-text-muted hover:text-text"
                  disabled={chatSending || chatMessages.length === 0}
                >
                  Clear chat
                </button>
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChatMessage();
                }}
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask a question..."
                  className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-bg"
                  disabled={chatSending}
                />
                <Button type="submit" disabled={chatSending || !chatInput.trim()}>
                  Send
                </Button>
              </form>
            </div>
          </Card>
        </div>
      )}

      {editOpen && editDraft && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">
                {cards.some((c) => c.id === editDraft.id) ? 'Edit Flashcard' : 'Create Flashcard'}
              </h2>
              <span className="text-xs text-text-muted">
                {nameFor(editDraft.language)} &middot; {formatSchemaLabel(editDraft.schema)}
              </span>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <label className="text-sm">
                <div className="text-text-muted mb-1">Language</div>
                <select
                  className="w-full px-3 py-2 border border-border rounded-lg bg-bg"
                  value={editDraft.language || 'es'}
                  onChange={(e) => setEditDraft((d) => ({ ...d, language: e.target.value }))}
                >
                  {LANGUAGE_LIST.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <div className="text-text-muted mb-1">Schema</div>
                <select
                  className="w-full px-3 py-2 border border-border rounded-lg bg-bg"
                  value={editDraft.schema || 'en_target'}
                  onChange={(e) =>
                    setEditDraft((d) => {
                      const nextSchema = e.target.value;
                      return {
                        ...d,
                        schema: nextSchema,
                        substitution: nextSchema === 'substitution'
                          ? {
                            ...emptySubstitution(d.realScript || d.term || d.romanization || ''),
                            ...(d.substitution || {}),
                            answerSide: 'en',
                          }
                          : null,
                      };
                    })
                  }
                >
                  {SCHEMA_OPTIONS.map((schema) => (
                    <option key={schema} value={schema}>
                      {formatSchemaLabel(schema)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <div className="text-text-muted mb-1">Real Script</div>
                <input
                  className="w-full px-3 py-2 border border-border rounded-lg bg-bg"
                  value={editDraft.realScript || ''}
                  onChange={(e) => setEditDraft((d) => ({ ...d, realScript: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <div className="text-text-muted mb-1">Romanization</div>
                <input
                  className="w-full px-3 py-2 border border-border rounded-lg bg-bg"
                  value={editDraft.romanization || ''}
                  onChange={(e) => setEditDraft((d) => ({ ...d, romanization: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <div className="text-text-muted mb-1">IPA</div>
                <input
                  className="w-full px-3 py-2 border border-border rounded-lg bg-bg"
                  value={editDraft.ipa || ''}
                  onChange={(e) => setEditDraft((d) => ({ ...d, ipa: e.target.value }))}
                />
              </label>
              <label className="text-sm">
                <div className="text-text-muted mb-1">English</div>
                <input
                  className="w-full px-3 py-2 border border-border rounded-lg bg-bg"
                  value={editDraft.translation || ''}
                  onChange={(e) => setEditDraft((d) => ({ ...d, translation: e.target.value }))}
                />
              </label>
            </div>

            {editDraft.schema === 'substitution' && (
              <div className="mt-4 space-y-3">
                <label className="text-sm block">
                  <div className="text-text-muted mb-1">Prompt</div>
                  <input
                    className="w-full px-3 py-2 border border-border rounded-lg bg-bg"
                    value={buildSubstitutionPromptText(editDraft)}
                    readOnly
                  />
                </label>
                <label className="text-sm block">
                  <div className="text-text-muted mb-1">Front Sentence</div>
                  <textarea
                    className="w-full px-3 py-2 border border-border rounded-lg bg-bg min-h-20"
                    value={editDraft.substitution?.frontSentence || ''}
                    onChange={(e) =>
                      setEditDraft((d) => ({
                        ...d,
                        substitution: { ...(d.substitution || {}), frontSentence: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="text-sm block">
                  <div className="text-text-muted mb-1">Corrected Sentence</div>
                  <textarea
                    className="w-full px-3 py-2 border border-border rounded-lg bg-bg min-h-20"
                    value={editDraft.substitution?.correctedSentence || ''}
                    onChange={(e) =>
                      setEditDraft((d) => ({
                        ...d,
                        substitution: { ...(d.substitution || {}), correctedSentence: e.target.value },
                      }))
                    }
                  />
                </label>
                <label className="text-sm block">
                  <div className="text-text-muted mb-1">Answer</div>
                  <input
                    className="w-full px-3 py-2 border border-border rounded-lg bg-bg"
                    value={editDraft.substitution?.answer || ''}
                    onChange={(e) =>
                      setEditDraft((d) => ({
                        ...d,
                        substitution: { ...(d.substitution || {}), answer: e.target.value, answerSide: 'en' },
                      }))
                    }
                  />
                </label>
              </div>
            )}

            <div className="flex items-center justify-between mt-5">
              <Button
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                onClick={deleteEditingCard}
              >
                Delete card
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveEdit}>
                  Save
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
