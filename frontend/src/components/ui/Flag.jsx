/**
 * Flag emoji component.
 * Converts country code to regional indicator Unicode emoji.
 */

const LANG_TO_COUNTRY = {
  en: 'GB',
  es: 'ES',
  fr: 'FR',
  pt: 'BR',
  it: 'IT',
  de: 'DE',
  pl: 'PL',
  ru: 'RU',
  ja: 'JP',
  zh: 'CN',
  ko: 'KR',
  ar: 'SA',
  he: 'IL',
};

function countryToEmoji(cc) {
  return [...cc].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}

const SIZES = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
};

export default function Flag({ code, size = 'md' }) {
  const cc = LANG_TO_COUNTRY[code];
  if (!cc) return null;

  return (
    <span className={`${SIZES[size] || SIZES.md} leading-none`} role="img" aria-label={code}>
      {countryToEmoji(cc)}
    </span>
  );
}
