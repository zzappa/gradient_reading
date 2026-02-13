/**
 * Web Speech API utility for text-to-speech.
 * Maps our language codes to BCP 47 tags for speechSynthesis.
 * Automatically selects the highest-quality voice available.
 *
 * Non-Latin script handling:
 *   Languages like Hebrew, Russian, Japanese display transliterated Latin text.
 *   Reading "shalom" with a Hebrew voice = garbage.
 *   → If native script is available, speak that with the target voice.
 *   → Otherwise, speak the transliteration with an English voice.
 */

const LANG_MAP = {
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
  pt: 'pt-BR',
  it: 'it-IT',
  de: 'de-DE',
  pl: 'pl-PL',
  ru: 'ru-RU',
  ja: 'ja-JP',
  zh: 'zh-CN',
  ko: 'ko-KR',
  ar: 'ar-SA',
  he: 'he-IL',
};

// Alternate BCP 47 prefixes browsers may use for the same language.
// Chrome uses legacy 'iw' for Hebrew; Arabic voices vary by region (ar-XA, ar-EG, etc.).
const LANG_ALIASES = {
  he: ['iw'],
  ar: ['ar'],
};

// Languages whose in-reader text is Latin transliteration, not native script
const NON_LATIN_LANGS = new Set(['ru', 'ja', 'zh', 'ko', 'he', 'ar']);

// Keywords that indicate higher-quality voices (ordered by preference)
const QUALITY_KEYWORDS = ['neural', 'enhanced', 'premium', 'wavenet', 'natural', 'google', 'microsoft'];

// Strip {{display|key}} or {{display|key|native}} annotations
// Also tolerates malformed variants like {{display|}key}.
const ANNOTATION_RE = /\{\{([^|]+)\|\}?([^|}]+)(?:\|\}?([^}]*))?\}\}?/g;

function normalizeAnnotationToken(value) {
  return (value || '').trim().replace(/^[{}|]+|[{}|]+$/g, '');
}

/**
 * For TTS: substitute annotations with the best text for speech.
 * - If displayNative (3rd field) is present → use it (native script, contextual form)
 * - Else if footnotesByKey has native_script → use it (native script, base form)
 * - Else → keep the display text (Latin transliteration)
 *
 * Returns { text, hasNativeSubstitutions } so the caller can pick the right voice.
 */
function stripAnnotationsForTTS(text, footnotesByKey) {
  let hasNative = false;
  let hasTransliterated = false;

  const result = text.replace(ANNOTATION_RE, (_, display, key, displayNative) => {
    const normalizedKey = normalizeAnnotationToken(key).toLowerCase();
    const normalizedNative = normalizeAnnotationToken(displayNative);

    if (normalizedNative) {
      hasNative = true;
      return normalizedNative;
    }
    const fn = footnotesByKey?.[normalizedKey];
    if (fn?.native_script) {
      hasNative = true;
      return fn.native_script;
    }
    hasTransliterated = true;
    return display;
  });

  return { text: result, hasNative, hasTransliterated };
}

function stripAnnotations(text) {
  return text.replace(ANNOTATION_RE, '$1');
}

// Cache best voice per language
const voiceCache = {};

function getBestVoice(langCode) {
  const bcp = LANG_MAP[langCode] || langCode;
  if (voiceCache[bcp]) return voiceCache[bcp];

  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  // Build all prefixes to try: primary + aliases (e.g. he → [he, iw])
  const langPrefix = bcp.split('-')[0];
  const prefixes = [langPrefix, ...(LANG_ALIASES[langCode] || [])];

  const matching = voices.filter((v) =>
    v.lang === bcp || prefixes.some((p) => v.lang === p || v.lang.startsWith(p + '-'))
  );

  if (!matching.length) return null;

  // Score each voice — higher is better
  function score(voice) {
    const name = voice.name.toLowerCase();
    let s = 0;
    for (let i = 0; i < QUALITY_KEYWORDS.length; i++) {
      if (name.includes(QUALITY_KEYWORDS[i])) {
        s += (QUALITY_KEYWORDS.length - i) * 10;
      }
    }
    // Prefer non-local voices (cloud-based tend to be better)
    if (!voice.localService) s += 5;
    // Prefer exact language match
    if (voice.lang === bcp) s += 3;
    return s;
  }

  matching.sort((a, b) => score(b) - score(a));
  voiceCache[bcp] = matching[0];
  return matching[0];
}

// Pre-load voices (some browsers load them asynchronously)
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    // Clear cache so we re-select with full voice list
    Object.keys(voiceCache).forEach((k) => delete voiceCache[k]);
  };
}

export function isSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isSpeaking() {
  return isSupported() && window.speechSynthesis.speaking;
}

export function stop() {
  if (isSupported()) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Split text into sentence-based chunks to avoid Chrome's ~15s speech cutoff.
 * Each chunk targets roughly MAX_CHUNK_LEN characters, split at sentence boundaries.
 */
const MAX_CHUNK_LEN = 200;

function chunkText(text) {
  if (text.length <= MAX_CHUNK_LEN) return [text];

  const sentences = text.match(/[^.!?…]+[.!?…]+[\s]*/g) || [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_CHUNK_LEN && current) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Resolve the best utterance.lang tag for a language.
 * Uses the found voice's own lang (handles Chrome's iw-IL for Hebrew, etc.)
 * or falls back to our LANG_MAP entry.
 */
function resolveUtteranceLang(langCode) {
  const voice = getBestVoice(langCode);
  if (voice) return { voice, lang: voice.lang };
  return { voice: null, lang: LANG_MAP[langCode] || langCode };
}

/**
 * Low-level: speak pre-cleaned text with a resolved language.
 * Chunks at sentence boundaries to avoid Chrome's ~15s speech cutoff.
 */
function speakClean(clean, langCode, opts = {}) {
  if (!clean.trim()) return;

  const chunks = chunkText(clean);
  const { voice, lang } = resolveUtteranceLang(langCode);
  let idx = 0;

  function speakNext() {
    if (idx >= chunks.length) {
      opts.onEnd?.();
      return;
    }

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const utterance = new SpeechSynthesisUtterance(chunks[idx]);
    utterance.lang = lang;
    utterance.rate = opts.rate || 0.85;
    if (voice) utterance.voice = voice;

    utterance.onend = () => {
      idx++;
      speakNext();
    };
    utterance.onerror = (e) => {
      if (e.error !== 'interrupted') {
        console.warn('Speech error:', e.error);
      }
      opts.onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }

  speakNext();
}

/**
 * Speak a text string in the given language.
 * Long text is chunked at sentence boundaries to avoid Chrome's speech cutoff.
 * @param {string} text — raw text (may contain {{display|key}} annotations)
 * @param {string} langCode — our language code (e.g. 'es')
 * @param {object} opts — { rate, onEnd, footnotesByKey }
 */
export function speak(text, langCode, opts = {}) {
  if (!isSupported()) return;

  stop();

  // For non-Latin languages: try to substitute native script for TTS,
  // then decide which voice to use based on what we got
  if (NON_LATIN_LANGS.has(langCode) && opts.footnotesByKey) {
    const result = stripAnnotationsForTTS(text, opts.footnotesByKey);
    if (result.hasNative && getBestVoice(langCode)) {
      // Native script substitutions + target voice available → speak native script
      speakClean(result.text, langCode, opts);
      return;
    }
    // No target voice or no native script — speak transliteration with English
    speakClean(stripAnnotations(text), 'en', opts);
    return;
  }

  speakClean(stripAnnotations(text), langCode, opts);
}

/**
 * Speak a single word/term.
 * For non-Latin languages:
 *   - If nativeText is provided, speak it with the target language voice.
 *   - Otherwise, speak the transliteration with an English voice.
 * For Latin languages: speak the display text with the target voice.
 *
 * @param {string} text — the display text (possibly transliterated)
 * @param {string} langCode — target language code
 * @param {string|null} nativeText — native script form (e.g. "שלום" for Hebrew)
 */
export function speakTerm(text, langCode, nativeText = null) {
  if (NON_LATIN_LANGS.has(langCode)) {
    if (nativeText && getBestVoice(langCode)) {
      // Native script + target voice available = correct pronunciation
      speak(nativeText, langCode, { rate: 0.75 });
    } else {
      // No target voice or no native text — speak transliteration with English.
      // Not perfect, but at least produces audible output.
      speak(text, 'en', { rate: 0.75 });
    }
  } else {
    // Latin-script language: display text IS the target script
    speak(text, langCode, { rate: 0.75 });
  }
}
