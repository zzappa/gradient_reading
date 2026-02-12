const STORAGE_KEY = 'gradient_alphabet_v1';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;

function safeParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function makeKey(lang, tabId, char) {
  return `${lang}_${tabId}_${char}`;
}

export function loadProgress() {
  if (typeof localStorage === 'undefined') return {};
  return safeParse(localStorage.getItem(STORAGE_KEY), {});
}

export function saveProgress(progress) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

const DEFAULT_STATS = {
  repetitions: 0,
  interval: 0,
  ease: 2.5,
  lastReviewedAt: null,
};

export function getCharProgress(progress, lang, tabId, char) {
  const key = makeKey(lang, tabId, char);
  return progress[key] || { dueAt: null, stats: { ...DEFAULT_STATS } };
}

export function reviewChar(progress, lang, tabId, char, rating, now = Date.now()) {
  const key = makeKey(lang, tabId, char);
  const prev = progress[key] || { dueAt: now, stats: { ...DEFAULT_STATS } };
  const prevStats = prev.stats || {};

  let interval = Number(prevStats.interval || 0);
  let ease = Number(prevStats.ease || 2.5);
  let repetitions = Number(prevStats.repetitions || 0);
  let dueAt = now;

  if (rating === 'again') {
    ease = Math.max(MIN_EASE, ease - 0.2);
    interval = 0;
    dueAt = now + 5 * MINUTE_MS;
  } else if (rating === 'hard') {
    ease = Math.max(MIN_EASE, ease - 0.15);
    interval = interval <= 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
    repetitions += 1;
    dueAt = now + interval * DAY_MS;
  } else if (rating === 'easy') {
    ease += 0.15;
    interval = interval <= 0 ? 2 : Math.max(2, Math.round(interval * ease * 1.3));
    repetitions += 1;
    dueAt = now + interval * DAY_MS;
  } else {
    // good
    interval = interval <= 0 ? 1 : Math.max(1, Math.round(interval * ease));
    repetitions += 1;
    dueAt = now + interval * DAY_MS;
  }

  return {
    ...progress,
    [key]: {
      dueAt,
      stats: {
        repetitions,
        interval,
        ease,
        lastReviewedAt: now,
      },
    },
  };
}

export function getDueChars(progress, lang, tabId, allChars, now = Date.now()) {
  return allChars.filter((c) => {
    const p = getCharProgress(progress, lang, tabId, c.char);
    // Never reviewed = due immediately
    if (!p.dueAt) return true;
    return p.dueAt <= now;
  });
}

export function getLearnedCount(progress, lang, tabId, allChars) {
  return allChars.filter((c) => {
    const p = getCharProgress(progress, lang, tabId, c.char);
    return p.stats.lastReviewedAt !== null;
  }).length;
}

export function getNextDueAt(progress, lang, tabId, allChars) {
  let earliest = null;
  for (const c of allChars) {
    const p = getCharProgress(progress, lang, tabId, c.char);
    if (!p.dueAt) return null; // unreviewed char = due now
    if (earliest === null || p.dueAt < earliest) earliest = p.dueAt;
  }
  return earliest;
}

export function getMasteryLevel(progress, lang, tabId, char) {
  const p = getCharProgress(progress, lang, tabId, char);
  if (!p.stats.lastReviewedAt) return 'unseen';
  if (p.stats.interval >= 7) return 'mastered';
  if (p.stats.repetitions >= 1) return 'learning';
  return 'unseen';
}

export function resetProgress(lang, tabId) {
  const progress = loadProgress();
  const prefix = `${lang}_${tabId}_`;
  const next = {};
  for (const key of Object.keys(progress)) {
    if (!key.startsWith(prefix)) next[key] = progress[key];
  }
  saveProgress(next);
  return next;
}
