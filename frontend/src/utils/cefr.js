const INTERNAL_TO_CEFR = {
  0: 'A1',
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
  6: 'C2',
  7: 'C2',
};

export function levelToCefr(level) {
  if (level == null || Number.isNaN(Number(level))) return null;
  return INTERNAL_TO_CEFR[Number(level)] || null;
}

export function displayCefr(level) {
  return levelToCefr(level) || 'Not assessed';
}
