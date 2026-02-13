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
  return entries.join('\n\n');
}

export function normalizeChapterContent(content) {
  const paragraphs = (content || '').split('\n\n');
  return paragraphs
    .map((paragraph) => normalizeEmbeddedParagraph(paragraph))
    .filter(Boolean)
    .join('\n\n');
}

export function splitChapterParagraphs(content) {
  const normalized = normalizeChapterContent(content || '');
  return normalized
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);
}
