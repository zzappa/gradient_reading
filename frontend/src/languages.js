export const LANGUAGES = {
  en: { name: 'English', script: 'latin' },
  es: { name: 'Spanish', script: 'latin' },
  fr: { name: 'French', script: 'latin' },
  pt: { name: 'Portuguese', script: 'latin' },
  it: { name: 'Italian', script: 'latin' },
  de: { name: 'German', script: 'latin' },
  pl: { name: 'Polish', script: 'latin' },
  ru: { name: 'Russian', script: 'cyrillic' },
  he: { name: 'Hebrew', script: 'hebrew' },
  ja: { name: 'Japanese', script: 'cjk' },
  zh: { name: 'Chinese', script: 'cjk' },
  ko: { name: 'Korean', script: 'hangul' },
  ar: { name: 'Arabic', script: 'arabic' },
};

export const LANGUAGE_LIST = Object.entries(LANGUAGES).map(([code, lang]) => ({
  code,
  ...lang,
}));

// Source and target use the same list
export const SOURCE_LANGUAGES = LANGUAGES;
export const SOURCE_LANGUAGE_LIST = LANGUAGE_LIST;

export function nameFor(code) {
  return LANGUAGES[code]?.name || code;
}
