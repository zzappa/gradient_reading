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

function escapeRegExp(text) {
  return (text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripParenthetical(text) {
  return (text || '').replace(/\([^)]*\)|\[[^\]]*]|{[^}]*}/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCandidateText(value) {
  return stripParenthetical(stripAnnotations(value || ''))
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isReasonableAnswer(value) {
  const text = normalizeCandidateText(value);
  if (!text) return false;
  if (/[.!?]/.test(text)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4;
}

function looksLikeGloss(text) {
  const value = (text || '').trim();
  if (!value) return true;
  return /[\/()]/.test(value);
}

function extractTranslationCandidates(translation) {
  const cleaned = stripParenthetical(stripAnnotations(translation || ''));
  if (!cleaned) return [];

  const pieces = cleaned
    .split(/[\/;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => normalizeCandidateText(s))
    .filter(Boolean);

  const unique = [];
  for (const piece of pieces) {
    if (!unique.some((u) => u.toLowerCase() === piece.toLowerCase())) {
      unique.push(piece);
    }
  }
  return unique;
}

function chooseAnswerCandidate(translation, correctedSentence) {
  const candidates = extractTranslationCandidates(translation).filter(isReasonableAnswer);
  if (!candidates.length) return '';

  const sentence = (correctedSentence || '').toLowerCase();
  if (!sentence) return candidates[0];

  const inSentence = candidates.find((candidate) => {
    const escaped = escapeRegExp(candidate.toLowerCase());
    const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
    return pattern.test(sentence);
  });
  return inSentence || candidates[0];
}

function sanitizeSubstitutionAnswer(rawAnswer, fallbackTranslation, correctedSentence) {
  const raw = (rawAnswer || '').trim();
  const fallback = (fallbackTranslation || '').trim();

  let answer = chooseAnswerCandidate(raw || fallback, correctedSentence)
    || chooseAnswerCandidate(fallback, correctedSentence)
    || '';

  if (!answer) {
    const candidates = [
      ...extractTranslationCandidates(raw),
      ...extractTranslationCandidates(fallback),
    ].filter(isReasonableAnswer);
    answer = candidates[0] || stripParenthetical(raw || fallback);
  }

  // Final hard clean: keep first concise variant only.
  answer = normalizeCandidateText(answer || '')
    .split(/[\/;,]/)
    .map((s) => s.trim())
    .filter(Boolean)[0] || '';

  if (!isReasonableAnswer(answer)) {
    answer = normalizeCandidateText(answer)
      .split(/\s+/)
      .map((token) => token.replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ\u0400-\u04FF']+|[^A-Za-zÀ-ÖØ-öø-ÿ\u0400-\u04FF']+$/g, ''))
      .find(Boolean) || '';
  }

  return answer.trim();
}

function normalizeSentenceOptionNoise(sentence, preferredReplacement = '') {
  const text = (sentence || '').trim();
  if (!text) return text;

  const preferred = normalizeCandidateText(preferredReplacement);
  const optionRe = /([A-Za-zÀ-ÖØ-öø-ÿ\u0400-\u04FF'-]{1,24})\s*\/\s*([A-Za-zÀ-ÖØ-öø-ÿ\u0400-\u04FF'-]{1,24})(?:\s*\([^)]*\))?/gi;

  return text
    .replace(optionRe, (_, left, right) => {
      if (preferred) return preferred;
      return normalizeCandidateText(left) || normalizeCandidateText(right) || '';
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

function replaceGlossPhrase(sentence, rawGloss, replacement) {
  const text = (sentence || '').trim();
  const raw = stripAnnotations(rawGloss || '').trim();
  const repl = (replacement || '').trim();
  if (!text || !raw || !repl || !looksLikeGloss(raw)) return text;

  const pattern = new RegExp(escapeRegExp(raw), 'i');
  if (!pattern.test(text)) return text;

  return text
    .replace(pattern, repl)
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .trim();
}

function replaceFirstInsensitive(text, needle, replacement) {
  const source = (text || '').trim();
  const find = (needle || '').trim();
  const repl = (replacement || '').trim();
  if (!source || !find || !repl) return source;

  const escaped = escapeRegExp(find);
  const wordLike = /^[A-Za-z0-9'-]+$/.test(find);
  const pattern = wordLike ? new RegExp(`\\b${escaped}\\b`, 'i') : new RegExp(escaped, 'i');
  if (!pattern.test(source)) return source;
  return source.replace(pattern, repl);
}

function pickTargetFromAnnotatedSentence(rawSentence, termKey, targetDisplay) {
  const sentence = rawSentence || '';
  const key = (termKey || '').trim().toLowerCase();
  const target = (targetDisplay || '').trim().toLowerCase();
  const fallback = (targetDisplay || '').trim();

  let firstDisplay = '';
  for (const match of sentence.matchAll(ANNOTATION_RE)) {
    const display = (match[1] || '').trim();
    const keyInSentence = normalizeAnnotationToken(match[2] || '').toLowerCase();
    if (!firstDisplay && display) firstDisplay = display;
    if (key && keyInSentence === key) return display || firstDisplay || fallback;
    if (target && display.toLowerCase() === target) return display || firstDisplay || fallback;
  }

  return firstDisplay || fallback;
}

function normalizeLoadedCard(card) {
  if (!card || card.schema !== 'substitution') return card;
  const s = card.substitution || {};
  const target = (card.realScript || card.romanization || card.term || '').trim();
  let normalized = { ...s };

  // Legacy cards that were built as "target sentence with English word".
  if (s.answerSide === 'target') {
    normalized = {
      ...normalized,
      variant: 'en_with_target',
      frontSentence: s.correctedSentence || s.frontSentence || '',
      correctedSentence: s.frontSentence || s.correctedSentence || '',
      answer: card.translation || s.answer || '',
      answerSide: 'en',
      prompt: `Replace "${target || 'the target word'}" with English.`,
    };
  }

  normalized = {
    ...normalized,
    answerSide: 'en',
  };

  let correctedSentence = (normalized.correctedSentence || '').trim();
  const rawAnswer = normalized.answer || card.translation || '';
  const answer = sanitizeSubstitutionAnswer(rawAnswer, card.translation || '', correctedSentence);
  correctedSentence = replaceGlossPhrase(correctedSentence, rawAnswer, answer);
  correctedSentence = normalizeSentenceOptionNoise(correctedSentence, answer);

  let frontSentence = (normalized.frontSentence || '').trim();
  frontSentence = replaceGlossPhrase(frontSentence, rawAnswer, target || answer);
  frontSentence = normalizeSentenceOptionNoise(frontSentence, target || answer);
  if (correctedSentence && target) {
    let rebuilt = replaceFirstInsensitive(correctedSentence, answer, target);
    if (!rebuilt && rawAnswer && rawAnswer !== answer) {
      rebuilt = replaceFirstInsensitive(correctedSentence, rawAnswer, target);
    }
    if (
      rebuilt &&
      (
        !frontSentence ||
        looksLikeGloss(rawAnswer) ||
        looksLikeGloss(frontSentence) ||
        frontSentence.toLowerCase() === correctedSentence.toLowerCase()
      )
    ) {
      frontSentence = rebuilt;
    }
  }

  return {
    ...card,
    substitution: {
      ...normalized,
      prompt: `Replace "${target || 'the target word'}" with English.`,
      frontSentence,
      correctedSentence,
      answer,
    },
  };
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
  const target = pickTargetFromAnnotatedSentence(rawSentence, termKey, targetDisplay) || english;

  // Original English sentence as the corrected version
  let correctedSentence = pickSourceSentence({
    sourceParagraphs,
    paragraphIndex,
    sentenceIndex,
    englishNeedle: english,
  });

  const answer = sanitizeSubstitutionAnswer(english, english, correctedSentence) || english;
  correctedSentence = replaceGlossPhrase(correctedSentence, english, answer);

  let frontSentenceFromSource = replaceFirstInsensitive(correctedSentence, answer, target);
  if (!frontSentenceFromSource && english && english !== answer) {
    frontSentenceFromSource = replaceFirstInsensitive(correctedSentence, english, target);
  }
  const frontSentence = frontSentenceFromSource || stripAnnotations(rawSentence);

  return {
    variant: 'en_with_target',
    prompt: `Replace "${target}" with English.`,
    frontSentence,
    correctedSentence: correctedSentence || answer,
    answer,
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
