const STORAGE_KEY = 'gradient_flashcards_v1';
const GENERIC_SUBSTITUTION_PROMPT = 'Replace the highlighted target word with English.';

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

function buildSubstitutionPrompt(target) {
  const clean = (target || '').trim();
  return clean ? `Replace "${clean}" with English.` : GENERIC_SUBSTITUTION_PROMPT;
}

function extractPromptTarget(prompt) {
  const text = (prompt || '').trim();
  if (!text) return '';
  const match = text.match(/^Replace\s+"(.+?)"\s+with English\.?$/i);
  return match ? (match[1] || '').trim() : '';
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
  if (!source || !find || !repl) return '';

  const wordLike = /^[\p{L}\p{M}0-9'’-]+$/u.test(find);
  if (wordLike) {
    const tokenRe = /[\p{L}\p{M}0-9'’-]+/gu;
    let match;
    while ((match = tokenRe.exec(source)) !== null) {
      const token = (match[0] || '').trim();
      if (token.toLowerCase() === find.toLowerCase()) {
        return `${source.slice(0, match.index)}${repl}${source.slice(match.index + token.length)}`;
      }
    }
    return '';
  }

  const escaped = escapeRegExp(find);
  const pattern = new RegExp(escaped, 'i');
  if (!pattern.test(source)) return '';
  return source.replace(pattern, repl);
}

function tokenizeWords(text) {
  return ((text || '').match(/[\p{L}\p{M}0-9'’-]+/gu) || []).filter(Boolean);
}

function commonPrefixLength(left, right) {
  const a = (left || '').toLowerCase();
  const b = (right || '').toLowerCase();
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

function levenshteinDistance(left, right) {
  const a = (left || '').toLowerCase();
  const b = (right || '').toLowerCase();
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const up = prev[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + cost);
      diagonal = up;
    }
  }
  return prev[b.length];
}

function findFuzzySentenceTargetToken(tokens, candidates = []) {
  let bestToken = '';
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateLower = (candidate || '').toLowerCase().trim();
    if (candidateLower.length < 4) continue;

    for (const token of tokens) {
      const tokenLower = (token || '').toLowerCase();
      if (tokenLower.length < 3) continue;
      const prefix = commonPrefixLength(tokenLower, candidateLower);
      if (prefix < 2) continue;

      const distance = levenshteinDistance(tokenLower, candidateLower);
      const similarity = 1 - (distance / Math.max(tokenLower.length, candidateLower.length));
      const score = similarity + Math.min(prefix, 4) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestToken = token;
      }
    }
  }

  return bestScore >= 0.72 ? bestToken : '';
}

function findExactNeedleInSentence(sentence, needle) {
  const text = (sentence || '').trim();
  const rawNeedle = (needle || '').trim();
  if (!text || !rawNeedle) return '';

  const wordLike = /^[\p{L}\p{M}0-9'’-]+$/u.test(rawNeedle);
  if (wordLike) {
    const tokenRe = /[\p{L}\p{M}0-9'’-]+/gu;
    let match;
    while ((match = tokenRe.exec(text)) !== null) {
      const token = (match[0] || '').trim();
      if (token.toLowerCase() === rawNeedle.toLowerCase()) {
        return token;
      }
    }
    return '';
  }

  const escaped = escapeRegExp(rawNeedle);
  const pattern = new RegExp(escaped, 'i');
  const match = text.match(pattern);
  return match ? (match[0] || '').trim() : '';
}

function findSentenceTargetToken(sentence, candidates = []) {
  const text = (sentence || '').trim();
  if (!text) return '';

  const cleanedCandidates = candidates
    .map((value) => (value || '').trim())
    .filter(Boolean)
    .filter((value, idx, arr) => arr.findIndex((x) => x.toLowerCase() === value.toLowerCase()) === idx)
    .sort((a, b) => b.length - a.length);

  for (const candidate of cleanedCandidates) {
    const exact = findExactNeedleInSentence(text, candidate);
    if (exact) return exact;
  }

  const tokens = tokenizeWords(text);
  for (const candidate of cleanedCandidates) {
    const lower = candidate.toLowerCase();
    if (lower.length < 3) continue;
    const prefixed = tokens.find((token) => token.toLowerCase().startsWith(lower));
    if (prefixed) return prefixed;
  }

  const fuzzy = findFuzzySentenceTargetToken(tokens, cleanedCandidates);
  if (fuzzy) return fuzzy;

  return '';
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
    const nativeInSentence = normalizeAnnotationToken(match[3] || '').toLowerCase();
    if (!firstDisplay && display) firstDisplay = display;
    if (key && keyInSentence === key) return display || firstDisplay || fallback;
    if (target && (display.toLowerCase() === target || nativeInSentence === target)) {
      return display || normalizeAnnotationToken(match[3] || '') || firstDisplay || fallback;
    }
  }

  return firstDisplay || fallback;
}

function normalizeLoadedCard(card) {
  if (!card || card.schema !== 'substitution') return card;
  const s = card.substitution || {};
  const baseTarget = (card.romanization || card.term || card.realScript || '').trim();
  const nativeTarget = (card.realScript || '').trim();
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
      prompt: buildSubstitutionPrompt(baseTarget),
    };
  }

  normalized = {
    ...normalized,
    answerSide: 'en',
  };

  let correctedSentence = normalizeCardSentenceText((normalized.correctedSentence || '').trim());
  const rawAnswer = normalized.answer || card.translation || '';
  const answer = sanitizeSubstitutionAnswer(rawAnswer, card.translation || '', correctedSentence);
  correctedSentence = replaceGlossPhrase(correctedSentence, rawAnswer, answer);
  correctedSentence = normalizeSentenceOptionNoise(correctedSentence, answer);

  let frontSentence = normalizeCardSentenceText((normalized.frontSentence || '').trim());
  frontSentence = replaceGlossPhrase(frontSentence, rawAnswer, baseTarget || answer);
  frontSentence = normalizeSentenceOptionNoise(frontSentence, baseTarget || answer);
  if (correctedSentence && baseTarget) {
    let rebuilt = replaceFirstInsensitive(correctedSentence, answer, baseTarget);
    if (!rebuilt && rawAnswer && rawAnswer !== answer) {
      rebuilt = replaceFirstInsensitive(correctedSentence, rawAnswer, baseTarget);
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

  const promptTargetFromPrompt = extractPromptTarget(normalized.prompt || s.prompt || '');
  const promptTargetFromSentence = findSentenceTargetToken(frontSentence, [
    baseTarget,
    card.term,
    card.romanization,
    nativeTarget,
    promptTargetFromPrompt,
  ]);
  const promptTarget = promptTargetFromSentence || baseTarget || card.term || card.romanization || '';

  let fixedFrontSentence = frontSentence;
  if (!findSentenceTargetToken(fixedFrontSentence, [promptTarget])) {
    const rebuiltForPrompt = replaceFirstInsensitive(correctedSentence, answer, promptTarget);
    if (rebuiltForPrompt) fixedFrontSentence = rebuiltForPrompt;
  }

  const finalPromptTarget = findSentenceTargetToken(fixedFrontSentence, [
    baseTarget,
    card.term,
    card.romanization,
    nativeTarget,
    promptTarget,
    promptTargetFromPrompt,
  ]);
  let fixedCorrectedSentence = correctedSentence;
  if (!findExactNeedleInSentence(fixedCorrectedSentence, answer)) {
    const derivedCorrected = replaceFirstInsensitive(
      fixedFrontSentence,
      finalPromptTarget || promptTarget || baseTarget,
      answer
    );
    if (derivedCorrected) fixedCorrectedSentence = derivedCorrected;
  }

  return {
    ...card,
    substitution: {
      ...normalized,
      prompt: buildSubstitutionPrompt(finalPromptTarget),
      frontSentence: fixedFrontSentence,
      correctedSentence: fixedCorrectedSentence,
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

function extractEmbeddedTextEntries(paragraph) {
  const raw = paragraph || '';
  const marker = '"text":"';
  const delimiter = '","footnote_refs":';
  const entries = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const start = raw.indexOf(marker, cursor);
    if (start < 0) break;
    const textStart = start + marker.length;
    const textEnd = raw.indexOf(delimiter, textStart);
    if (textEnd < 0) break;
    const extracted = raw
      .slice(textStart, textEnd)
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\\\/g, '\\')
      .trim();
    if (extracted) entries.push(extracted);
    cursor = textEnd + delimiter.length;
  }

  return entries;
}

function normalizeEmbeddedParagraph(paragraph) {
  const raw = (paragraph || '').trim();
  if (!raw) return '';
  if (!raw.includes('"text":"') || !raw.includes('"footnote_refs"')) return raw;

  const entries = extractEmbeddedTextEntries(raw);
  if (!entries.length) return raw;
  return entries.join(' ');
}

function stripInlineFootnoteNoise(text) {
  const raw = (text || '').trim();
  if (!raw) return '';
  const marker = '","footnote_refs":[';
  const idx = raw.indexOf(marker);
  if (idx < 0) return raw;

  return raw
    .slice(0, idx)
    .replace(/^\[\{"text":"/, '')
    .replace(/^\{"text":"/, '')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\')
    .trim();
}

function normalizeCardSentenceText(text) {
  const fromNoise = stripInlineFootnoteNoise(text || '');
  const normalized = normalizeEmbeddedParagraph(fromNoise);
  return (normalized || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTransformedTextContent(text) {
  const paragraphs = (text || '').split('\n\n');
  return paragraphs
    .map((p) => normalizeEmbeddedParagraph(p))
    .filter(Boolean)
    .join('\n\n');
}

function splitSentenceCandidates(text) {
  const source = (text || '').trim();
  if (!source) return [];

  const parts = [];
  const boundary = /[.!?]+["'”’»)]*\s+/g;
  let start = 0;

  while (boundary.exec(source) !== null) {
    const end = boundary.lastIndex;
    const segment = source.slice(start, end).trim();
    if (segment) parts.push(segment);
    start = end;
  }

  const tail = source.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}


function splitSentences(text) {
  return splitSentenceCandidates(text)
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

function findTermParagraphIndexes(footnotes, termKey, targetDisplay) {
  const key = (termKey || '').trim().toLowerCase();
  const target = (targetDisplay || '').trim().toLowerCase();
  const list = Array.isArray(footnotes) ? footnotes : [];
  const indexes = new Set();

  for (const fn of list) {
    const term = (fn?.term || '').trim().toLowerCase();
    const native = (fn?.native_script || '').trim().toLowerCase();
    if (!term && !native) continue;
    if (term === key || (target && (term === target || native === target))) {
      const idx = Number(fn.paragraph_index);
      if (Number.isFinite(idx) && idx >= 0) indexes.add(idx);
    }
  }

  return [...indexes].sort((a, b) => a - b);
}

function findSentenceIndexWithTerm(transformedParagraph, termKey, targetDisplay) {
  const key = (termKey || '').trim().toLowerCase();
  const target = (targetDisplay || '').trim().toLowerCase();
  const sentences = splitSentenceCandidates(transformedParagraph || '')
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i];

    for (const match of sentence.matchAll(ANNOTATION_RE)) {
      const display = (match[1] || '').trim().toLowerCase();
      const keyInSentence = (match[2] || '').trim().toLowerCase();
      const nativeInSentence = normalizeAnnotationToken(match[3] || '').toLowerCase();
      if (
        (key && keyInSentence === key) ||
        (target && (display === target || nativeInSentence === target))
      ) {
        return i;
      }
    }

    const plain = stripAnnotations(sentence);
    if (findSentenceTargetToken(plain, [target, key])) return i;
  }

  return -1;
}

function findTermSentenceLocation({ transformedParagraphs, footnotes, termKey, targetDisplay }) {
  const paragraphs = Array.isArray(transformedParagraphs) ? transformedParagraphs : [];
  const preferred = findFirstTermParagraphIndex(footnotes, termKey, targetDisplay);
  const byFootnote = findTermParagraphIndexes(footnotes, termKey, targetDisplay);
  const paragraphOrder = [
    ...byFootnote,
    preferred,
    ...paragraphs.map((_, idx) => idx),
  ].filter((idx, pos, arr) => Number.isFinite(idx) && idx >= 0 && arr.indexOf(idx) === pos);

  for (const paragraphIndex of paragraphOrder) {
    const paragraph = paragraphs[paragraphIndex] || '';
    const sentenceIndex = findSentenceIndexWithTerm(paragraph, termKey, targetDisplay);
    if (sentenceIndex >= 0) {
      return { paragraphIndex, sentenceIndex, found: true };
    }
  }

  return {
    paragraphIndex: Number.isFinite(preferred) && preferred >= 0 ? preferred : 0,
    sentenceIndex: 0,
    found: false,
  };
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
  const normalizedTransformed = normalizeTransformedTextContent(transformedText || chapterTransformed || '');
  const transformedParagraphs = normalizedTransformed.split('\n\n').filter(Boolean);

  const { paragraphIndex, sentenceIndex } = findTermSentenceLocation({
    transformedParagraphs,
    footnotes: chapter?.footnotes,
    termKey,
    targetDisplay,
  });
  const transformedParagraph = transformedParagraphs[paragraphIndex] || transformedParagraphs[0] || '';

  // Extract the transformed sentence directly — the LLM already placed the target
  // word grammatically in a mixed sentence during transformation.
  const transformedSentences = splitSentenceCandidates(transformedParagraph || '')
    .map((s) => s.trim())
    .filter(Boolean);
  const rawSentence = normalizeCardSentenceText(
    transformedSentences[sentenceIndex] || transformedSentences[0] || ''
  );
  const target = pickTargetFromAnnotatedSentence(rawSentence, termKey, targetDisplay)
    || (termKey || '').trim()
    || (targetDisplay || '').trim();

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
  let frontSentence = frontSentenceFromSource || stripAnnotations(rawSentence);
  if (!frontSentence) {
    frontSentence = correctedSentence || '';
  }
  const promptTarget = findSentenceTargetToken(frontSentence, [target, termKey, targetDisplay])
    || findSentenceTargetToken(stripAnnotations(rawSentence), [target, termKey, targetDisplay]);
  let normalizedCorrected = correctedSentence || answer;
  if (!findExactNeedleInSentence(normalizedCorrected, answer)) {
    const derivedCorrected = replaceFirstInsensitive(frontSentence, promptTarget || target, answer);
    if (derivedCorrected) normalizedCorrected = derivedCorrected;
  }

  return {
    variant: 'en_with_target',
    prompt: buildSubstitutionPrompt(promptTarget),
    frontSentence,
    correctedSentence: normalizedCorrected || answer,
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
