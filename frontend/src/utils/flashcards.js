const STORAGE_KEY = 'gradient_flashcards_v1';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;

export const FLASHCARD_SCHEMAS = {
  en_target: { label: 'EN -> Target' },
  target_en: { label: 'Target -> EN' },
  substitution: { label: 'Substitution' },
};

// Also tolerates malformed variants like {{display|}key}.
const ANNOTATION_RE = /\{\{([^|]+)\|\}?([^|}]+)(?:\|\}?([^}]*))?\}\}?/g;

function normalizeAnnotationToken(value) {
  return (value || '').trim().replace(/^[{}|]+|[{}|]+$/g, '');
}

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeLoadedCard(card) {
  if (!card || card.schema !== 'substitution') return card;
  const s = card.substitution || {};

  // Legacy cards that were built as "target sentence with English word".
  if (s.answerSide === 'target') {
    const target = card.romanization || card.term || card.realScript || '';
    return {
      ...card,
      substitution: {
        ...s,
        variant: 'en_with_target',
        frontSentence: s.correctedSentence || s.frontSentence || '',
        correctedSentence: s.frontSentence || s.correctedSentence || '',
        answer: card.translation || s.answer || '',
        answerSide: 'en',
        prompt: `Replace "${target}" with English.`,
      },
    };
  }

  if (s.answerSide !== 'en') {
    return {
      ...card,
      substitution: {
        ...s,
        answerSide: 'en',
        answer: s.answer || card.translation || '',
      },
    };
  }

  return card;
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeIpa(pronunciation) {
  const p = (pronunciation || '').trim();
  if (!p) return '';
  if (p.startsWith('/') && p.endsWith('/')) return p;
  return `/${p}/`;
}

function parseAnnotations(text) {
  const segments = [];
  let last = 0;
  for (const match of text.matchAll(ANNOTATION_RE)) {
    if (match.index > last) {
      segments.push({ type: 'text', content: text.slice(last, match.index) });
    }
    segments.push({
      type: 'term',
      display: match[1],
      key: normalizeAnnotationToken(match[2]),
      displayNative: normalizeAnnotationToken(match[3] || '') || null,
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ type: 'text', content: text.slice(last) });
  }
  return segments;
}

function stripAnnotations(text) {
  const segments = parseAnnotations(text);
  return segments.map((s) => (s.type === 'text' ? s.content : s.display)).join('');
}


function splitSentences(text) {
  return (text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => stripAnnotations(s).trim())
    .filter(Boolean);
}

function findFirstTermParagraphIndex(footnotes, termKey, targetDisplay) {
  const key = (termKey || '').trim().toLowerCase();
  const target = (targetDisplay || '').trim().toLowerCase();
  const list = Array.isArray(footnotes) ? footnotes : [];

  for (const fn of list) {
    const term = (fn?.term || '').trim().toLowerCase();
    if (!term) continue;
    if (term === key || (target && term === target)) {
      const idx = Number(fn.paragraph_index);
      if (Number.isFinite(idx) && idx >= 0) return idx;
    }
  }
  return 0;
}

function findSentenceIndexWithTerm(transformedParagraph, termKey, targetDisplay) {
  const key = (termKey || '').trim().toLowerCase();
  const target = (targetDisplay || '').trim().toLowerCase();
  const sentences = (transformedParagraph || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i];

    for (const match of sentence.matchAll(ANNOTATION_RE)) {
      const display = (match[1] || '').trim().toLowerCase();
      const keyInSentence = (match[2] || '').trim().toLowerCase();
      if ((key && keyInSentence === key) || (target && display === target)) {
        return i;
      }
    }

    const plain = stripAnnotations(sentence).toLowerCase();
    if (target && plain.includes(target)) return i;
  }

  return 0;
}

function pickSourceSentence({ sourceParagraphs, paragraphIndex, sentenceIndex, englishNeedle }) {
  const paragraphs = Array.isArray(sourceParagraphs) ? sourceParagraphs : [];
  const preferred = paragraphs[paragraphIndex] || '';
  const preferredSentences = splitSentences(preferred);

  if (preferredSentences.length && sentenceIndex < preferredSentences.length) {
    return preferredSentences[sentenceIndex];
  }

  const needle = (englishNeedle || '').trim().toLowerCase();
  if (needle && preferredSentences.length) {
    const match = preferredSentences.find((s) => s.toLowerCase().includes(needle));
    if (match) return match;
  }

  if (preferredSentences.length) return preferredSentences[0];

  for (const para of paragraphs) {
    const sentences = splitSentences(para);
    if (!sentences.length) continue;
    if (!needle) return sentences[0];
    const match = sentences.find((s) => s.toLowerCase().includes(needle));
    if (match) return match;
  }

  return '';
}

export function buildSubstitutionData({
  chapter,
  termKey,
  sourceText,
  transformedText,
  targetDisplay,
  translation,
}) {
  const english = (translation || '').trim() || '';
  const target = (targetDisplay || '').trim() || english;

  // Use first translation alternative as the answer (before comma/semicolon)
  const primaryEnglish = english.split(/[,;]/).map((s) => s.trim()).filter(Boolean)[0] || english;

  const chapterSource = chapter?.source_text || '';
  const chapterTransformed = chapter?.content || '';
  const sourceParagraphs = (sourceText || chapterSource || '').split('\n\n').filter(Boolean);
  const transformedParagraphs = (transformedText || chapterTransformed || '').split('\n\n').filter(Boolean);

  const paragraphIndex = findFirstTermParagraphIndex(chapter?.footnotes, termKey, targetDisplay);
  const transformedParagraph = transformedParagraphs[paragraphIndex] || transformedParagraphs[0] || '';
  const sentenceIndex = findSentenceIndexWithTerm(transformedParagraph, termKey, targetDisplay);

  // Extract the transformed sentence directly — the LLM already placed the target
  // word grammatically in a mixed sentence during transformation.
  const transformedSentences = (transformedParagraph || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const rawSentence = transformedSentences[sentenceIndex] || transformedSentences[0] || '';
  const frontSentence = stripAnnotations(rawSentence);

  // Original English sentence as the corrected version
  const correctedSentence = pickSourceSentence({
    sourceParagraphs,
    paragraphIndex,
    sentenceIndex,
    englishNeedle: primaryEnglish,
  });

  return {
    variant: 'en_with_target',
    prompt: `Replace "${target}" with English.`,
    frontSentence,
    correctedSentence: correctedSentence || primaryEnglish,
    answer: primaryEnglish,
    answerSide: 'en',
  };
}

export function loadFlashcards() {
  if (typeof localStorage === 'undefined') return [];
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY), []);
  const normalized = parsed.map(normalizeLoadedCard);
  const changed = JSON.stringify(parsed) !== JSON.stringify(normalized);
  if (changed) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function saveFlashcards(cards) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function createFlashcardFromTerm(term, schema, substitution = null) {
  const now = Date.now();
  const realScript = (term.native_script || '').trim() || term.term;
  const romanization = (term.term || '').trim();

  return {
    id: makeId(),
    createdAt: now,
    updatedAt: now,
    dueAt: now,
    schema,
    language: term.language,
    termKey: term.term_key,
    term: term.term,
    realScript,
    romanization,
    ipa: normalizeIpa(term.pronunciation || ''),
    translation: term.translation || '',
    grammarNote: term.grammar_note || '',
    projectId: term.project_id,
    firstChapter: term.first_chapter ?? 0,
    substitution: schema === 'substitution' ? substitution : null,
    stats: {
      repetitions: 0,
      interval: 0, // days
      ease: 2.5,
      lastReviewedAt: null,
    },
  };
}

export function upsertFlashcard(card) {
  const cards = loadFlashcards();
  const idx = cards.findIndex(
    (c) =>
      c.termKey === card.termKey &&
      c.language === card.language &&
      c.schema === card.schema
  );

  if (idx >= 0) {
    const merged = {
      ...cards[idx],
      ...card,
      id: cards[idx].id,
      createdAt: cards[idx].createdAt,
      dueAt: cards[idx].dueAt ?? card.dueAt,
      stats: cards[idx].stats || card.stats,
      updatedAt: Date.now(),
    };
    cards[idx] = merged;
    saveFlashcards(cards);
    return { mode: 'updated', card: merged, cards };
  }

  const next = [card, ...cards];
  saveFlashcards(next);
  return { mode: 'created', card, cards: next };
}

export function deleteFlashcard(cardId) {
  const cards = loadFlashcards().filter((c) => c.id !== cardId);
  saveFlashcards(cards);
  return cards;
}

export function getDueFlashcards(cards, now = Date.now()) {
  return cards
    .filter((c) => (c.dueAt || 0) <= now)
    .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
}

export function getNextDueAt(cards) {
  const dueTimes = cards
    .map((c) => c.dueAt || 0)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  return dueTimes.length ? dueTimes[0] : null;
}

export function reviewFlashcard(card, rating, now = Date.now()) {
  const prevStats = card.stats || {};
  let interval = Number(prevStats.interval || 0);
  let ease = Number(prevStats.ease || 2.5);
  let repetitions = Number(prevStats.repetitions || 0);
  let dueAt = now;

  if (rating === 'again') {
    ease = Math.max(MIN_EASE, ease - 0.2);
    interval = 0;
    dueAt = now + (5 * MINUTE_MS);
  } else if (rating === 'hard') {
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = interval <= 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
    repetitions += 1;
    dueAt = now + (interval * DAY_MS);
  } else if (rating === 'easy') {
    ease += 0.15;
    interval = interval <= 0 ? 2 : Math.max(2, Math.round(interval * ease * 1.3));
    repetitions += 1;
    dueAt = now + (interval * DAY_MS);
  } else {
    // good
    interval = interval <= 0 ? 1 : Math.max(1, Math.round(interval * ease));
    repetitions += 1;
    dueAt = now + (interval * DAY_MS);
  }

  return {
    ...card,
    dueAt,
    updatedAt: now,
    stats: {
      repetitions,
      interval,
      ease,
      lastReviewedAt: now,
    },
  };
}

export function formatSchemaLabel(schema) {
  return FLASHCARD_SCHEMAS[schema]?.label || schema;
}
