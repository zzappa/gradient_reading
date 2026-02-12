import { useEffect, useMemo, useState } from 'react';
import PageLayout from '../components/layout/PageLayout';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import {
  deleteFlashcard,
  formatSchemaLabel,
  getDueFlashcards,
  getNextDueAt,
  loadFlashcards,
  reviewFlashcard,
  saveFlashcards,
} from '../utils/flashcards';
import { nameFor } from '../languages';
import { isSupported as speechSupported, speak, speakTerm, stop } from '../utils/speech';

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
    return (
      <>
        <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
          Substitution
        </p>
        <p className="text-sm text-text-muted text-center mb-4">
          {substitution.prompt || 'Replace the highlighted target word with English.'}
        </p>
        <p className="font-serif text-2xl leading-relaxed text-center">
          {substitution.frontSentence || ''}
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
    return (
      <>
        <p className="text-xs uppercase tracking-wide text-text-muted text-center mb-3">
          Answer
        </p>
        <p className="font-serif text-4xl leading-tight text-center mb-3">
          {substitution.answer || card.translation}
        </p>
        <p className="text-sm text-text-muted text-center mt-3">
          Correct sentence:
        </p>
        <p className="font-serif text-lg leading-relaxed text-center mt-1">
          {substitution.correctedSentence || substitution.frontSentence || ''}
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

export default function Flashcards() {
  const [cards, setCards] = useState([]);
  const [mode, setMode] = useState('due');
  const [currentId, setCurrentId] = useState(null);
  const [showBack, setShowBack] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(null);

  useEffect(() => {
    setCards(loadFlashcards());
  }, []);

  useEffect(() => {
    setNowTick(Date.now());
    const t = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => () => stop(), []);

  const queue = useMemo(() => {
    if (mode === 'all') {
      return [...cards].sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
    }
    return getDueFlashcards(cards, nowTick);
  }, [cards, mode, nowTick]);

  const nextDueAt = useMemo(() => getNextDueAt(cards), [cards]);

  useEffect(() => {
    if (!queue.length) {
      setCurrentId(null);
      setShowBack(false);
      return;
    }
    if (!currentId || !queue.some((c) => c.id === currentId)) {
      setCurrentId(queue[0].id);
      setShowBack(false);
    }
  }, [queue, currentId]);

  const currentCard = useMemo(
    () => queue.find((c) => c.id === currentId) || null,
    [queue, currentId]
  );

  function updateCards(next) {
    saveFlashcards(next);
    setCards(next);
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

  function openEdit() {
    if (!currentCard) return;
    setEditDraft(JSON.parse(JSON.stringify(currentCard)));
    setEditOpen(true);
  }

  function saveEdit() {
    if (!editDraft) return;
    const base = cards.find((c) => c.id === editDraft.id);
    if (!base) return;
    const updated = {
      ...base,
      ...editDraft,
      substitution: editDraft.schema === 'substitution'
        ? { ...(editDraft.substitution || {}) }
        : null,
      updatedAt: Date.now(),
    };
    const next = cards.map((c) => (c.id === updated.id ? updated : c));
    updateCards(next);
    setEditOpen(false);
  }

  function deleteEditingCard() {
    if (!editDraft) return;
    if (!window.confirm('Delete this flashcard?')) return;
    const next = deleteFlashcard(editDraft.id);
    setCards(next);
    setEditOpen(false);
    setShowBack(false);
  }

  function playWordAudio() {
    if (!currentCard || !speechSupported()) return;
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
    speak(sentence, 'en', { rate: 0.9 });
  }

  return (
    <PageLayout wide>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Flashcards</h1>
          <p className="text-sm text-text-muted mt-1">
            Anki-style review for dictionary terms
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={mode === 'due' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setMode('due');
              setShowBack(false);
            }}
          >
            Due ({getDueFlashcards(cards, nowTick).length})
          </Button>
          <Button
            variant={mode === 'all' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => {
              setMode('all');
              setShowBack(false);
            }}
          >
            All ({cards.length})
          </Button>
        </div>
      </div>

      {!cards.length ? (
        <Card className="p-8 text-center">
          <p className="text-text-muted">
            No flashcards yet. Create cards from Dictionary rows.
          </p>
        </Card>
      ) : !queue.length ? (
        <Card className="p-8 text-center">
          <p className="text-text-muted">
            No cards due right now.
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
                <div className="flex items-center justify-between mb-5">
                  <div className="text-sm text-text-muted">
                    {nameFor(currentCard.language)} &middot; {formatSchemaLabel(currentCard.schema)}
                  </div>
                  <div className="flex items-center gap-2">
                    {speechSupported() && currentCard.schema === 'substitution' && (
                      <Button variant="secondary" size="sm" onClick={playSentenceAudio}>
                        Play sentence
                      </Button>
                    )}
                    {speechSupported() && (
                      <Button variant="secondary" size="sm" onClick={playWordAudio}>
                        Play word
                      </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={openEdit}>
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

      {editOpen && editDraft && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg">Edit Flashcard</h2>
              <span className="text-xs text-text-muted">
                {nameFor(editDraft.language)} &middot; {formatSchemaLabel(editDraft.schema)}
              </span>
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
                    value={editDraft.substitution?.prompt || ''}
                    onChange={(e) =>
                      setEditDraft((d) => ({
                        ...d,
                        substitution: { ...(d.substitution || {}), prompt: e.target.value },
                      }))
                    }
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
