"""Export services: PDF, Markdown, EPUB generation."""
import io
import re
import tempfile
from datetime import datetime, timezone

# Strip {{display_text|term_key}} or {{display_text|term_key|native}} annotations → keep display_text.
# Also tolerates malformed variants like {{display|}base}.
_ANNOTATION_RE = re.compile(r"\{\{([^|]+)\|\}?[^}]+\}\}?")

# Extract parts: group1=display, group2=term_key (base form), optional group3=native_display
_ANNOTATION_PARTS_RE = re.compile(r"\{\{([^|]+)\|\}?([^|}]+)(?:\|\}?[^}]*)?\}\}?")


def _strip_annotations(text: str) -> str:
    """Remove inline annotation markers, keeping the display text."""
    return _ANNOTATION_RE.sub(r"\1", text)


def _green_annotations(text: str) -> str:
    """Replace {{display|key}} or {{display|key|native}} with green-styled <span> keeping display text."""
    # Escape non-annotation text, wrap annotations in green spans
    def _replace(m):
        return f"<span class='term'>{_esc(m.group(1))}</span>"
    return _replace_with_escaped_gaps(text, _ANNOTATION_RE, _replace)


def _green_annotations_with_ipa(text: str, footnotes_by_term: dict) -> str:
    """Replace annotations with highlighted spans that include IPA ruby annotations."""
    def _replace(m):
        display = _esc(m.group(1))
        term_key = m.group(2).lower().strip().strip("{}|")
        ft = footnotes_by_term.get(term_key, {})
        pronunciation = ft.get("pronunciation", "")
        if pronunciation:
            return (
                f"<span class='term'>{display}"
                f"<span class='ipa'>/{_esc(pronunciation)}/</span>"
                f"</span>"
            )
        return f"<span class='term'>{display}</span>"
    return _replace_with_escaped_gaps(text, _ANNOTATION_PARTS_RE, _replace)


def _replace_with_escaped_gaps(text: str, pattern, replace_fn) -> str:
    """Apply regex replace_fn to matches while escaping non-matched text."""
    parts = []
    last = 0
    for m in pattern.finditer(text):
        if m.start() > last:
            parts.append(_esc(text[last:m.start()]))
        parts.append(replace_fn(m))
        last = m.end()
    if last < len(text):
        parts.append(_esc(text[last:]))
    return "".join(parts)


from weasyprint import HTML
from ebooklib import epub


# ── HTML / PDF ──────────────────────────────────────────────────────────────

PDF_CSS = """
@page {
    size: A4;
    margin: 2.5cm;
    @bottom-center { content: counter(page); font-size: 10pt; color: #888; }
}
body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16pt;
    line-height: 2;
    color: #1a1a1a;
}
.term {
    color: #16a34a;
    background-color: #f0fdf4;
    padding: 0 2px;
    border-radius: 2px;
}
.term .ipa {
    font-size: 9pt;
    color: #888;
    font-style: italic;
    margin-left: 2px;
}
.cover {
    text-align: center;
    padding-top: 30%;
    page-break-after: always;
}
.cover h1 { font-size: 32pt; margin-bottom: 0.5em; }
.cover .meta { font-size: 13pt; color: #666; margin-top: 1em; }
.chapter { page-break-before: always; }
.chapter h2 {
    font-size: 20pt;
    border-bottom: 1px solid #e5e5e5;
    padding-bottom: 0.3em;
    margin-bottom: 1em;
}
.chapter .level-badge {
    font-size: 11pt;
    color: #888;
    font-weight: normal;
}
.footnotes {
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid #e5e5e5;
    font-size: 11pt;
    color: #555;
}
.footnotes dt { font-weight: bold; color: #16a34a; }
.footnotes dd { margin-left: 1em; margin-bottom: 0.5em; }
.footnotes .fn-ipa { font-style: italic; color: #888; }
.footnotes .fn-grammar { font-size: 10pt; color: #777; }
"""


def _build_footnote_lookup(footnotes: list) -> dict:
    """Build term-key → footnote dict for IPA lookup."""
    lookup = {}
    for ft in footnotes:
        key = ft.get("term", "").lower().strip()
        if key and key not in lookup:
            lookup[key] = ft
    return lookup


def _build_html(title: str, chapters: list, start_level: int) -> str:
    max_level = max((ch.level for ch in chapters), default=start_level)
    date_str = datetime.now(timezone.utc).strftime("%B %d, %Y")

    html_parts = [
        f"<!DOCTYPE html><html><head><meta charset='utf-8'><style>{PDF_CSS}</style></head><body>",
        f"<div class='cover'><h1>{_esc(title)}</h1>",
        f"<p class='meta'>Levels {start_level} &rarr; {max_level}</p>",
        f"<p class='meta'>{date_str}</p></div>",
    ]

    for ch in chapters:
        html_parts.append(f"<div class='chapter'>")
        html_parts.append(
            f"<h2>Chapter {ch.chapter_num} <span class='level-badge'>Level {ch.level}</span></h2>"
        )

        footnotes = ch.footnotes or []
        fn_lookup = _build_footnote_lookup(footnotes)

        for para in (ch.content or "").split("\n\n"):
            if para.strip():
                html_parts.append(f"<p>{_green_annotations_with_ipa(para.strip(), fn_lookup)}</p>")

        if footnotes:
            html_parts.append("<div class='footnotes'><dl>")
            seen = set()
            for ft in footnotes:
                term = ft.get("term", "")
                if term in seen:
                    continue
                seen.add(term)
                translation = ft.get("translation", "")
                pronunciation = ft.get("pronunciation", "")
                grammar_note = ft.get("grammar_note", "")
                native_script = ft.get("native_script", "")

                dt_parts = [_esc(term)]
                if native_script and native_script != term:
                    dt_parts.append(f" ({_esc(native_script)})")

                dd_parts = [_esc(translation)]
                if pronunciation:
                    dd_parts.append(f" <span class='fn-ipa'>/{_esc(pronunciation)}/</span>")
                if grammar_note:
                    dd_parts.append(f" <span class='fn-grammar'>— {_esc(grammar_note)}</span>")

                html_parts.append(f"<dt>{''.join(dt_parts)}</dt><dd>{''.join(dd_parts)}</dd>")
            html_parts.append("</dl></div>")

        html_parts.append("</div>")

    html_parts.append("</body></html>")
    return "".join(html_parts)


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def export_pdf(title: str, chapters: list, start_level: int) -> bytes:
    """Generate a PDF from project chapters. Returns PDF bytes."""
    html_str = _build_html(title, chapters, start_level)
    return HTML(string=html_str).write_pdf()


# ── Markdown ────────────────────────────────────────────────────────────────

def export_markdown(title: str, chapters: list, start_level: int) -> str:
    """Generate Markdown text from project chapters."""
    max_level = max((ch.level for ch in chapters), default=start_level)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    lines = [
        "---",
        f"title: \"{title}\"",
        f"levels: {start_level}-{max_level}",
        f"date: {date_str}",
        "---",
        "",
        f"# {title}",
        "",
    ]

    for ch in chapters:
        lines.append(f"## Chapter {ch.chapter_num} (Level {ch.level})")
        lines.append("")
        lines.append(_strip_annotations(ch.content or ""))
        lines.append("")

        footnotes = ch.footnotes or []
        if footnotes:
            seen = set()
            fn_num = 1
            for ft in footnotes:
                term = ft.get("term", "")
                if term in seen:
                    continue
                seen.add(term)
                translation = ft.get("translation", "")
                pronunciation = ft.get("pronunciation", "")
                grammar_note = ft.get("grammar_note", "")
                native_script = ft.get("native_script", "")

                parts = [f"**{term}**"]
                if native_script and native_script != term:
                    parts.append(f" ({native_script})")
                parts.append(f" — {translation}")
                if pronunciation:
                    parts.append(f" /{pronunciation}/")
                if grammar_note:
                    parts.append(f" — {grammar_note}")

                lines.append(f"[^{fn_num}]: {''.join(parts)}")
                fn_num += 1
            lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


# ── EPUB ────────────────────────────────────────────────────────────────────

EPUB_CSS = """
body { font-family: Georgia, serif; font-size: 1.2em; line-height: 1.8; color: #1a1a1a; }
h2 { border-bottom: 1px solid #ccc; padding-bottom: 0.3em; }
.level-badge { font-size: 0.8em; color: #888; }
.term { color: #16a34a; background-color: #f0fdf4; padding: 0 2px; border-radius: 2px; }
.term .ipa { font-size: 0.7em; color: #888; font-style: italic; margin-left: 2px; }
.footnotes { margin-top: 2em; border-top: 1px solid #ccc; padding-top: 1em; font-size: 0.9em; color: #555; }
.footnotes dt { font-weight: bold; color: #16a34a; }
.footnotes .fn-ipa { font-style: italic; color: #888; }
.footnotes .fn-grammar { font-size: 0.85em; color: #777; }
"""


def export_epub(title: str, chapters: list, start_level: int) -> bytes:
    """Generate an EPUB from project chapters. Returns EPUB bytes."""
    book = epub.EpubBook()
    book.set_identifier(f"gradient-{title[:20]}")
    book.set_title(title)
    book.set_language("en")
    book.add_metadata("DC", "description", "Generated by Gradient Immersion")

    style = epub.EpubItem(
        uid="style", file_name="style/default.css", media_type="text/css", content=EPUB_CSS.encode()
    )
    book.add_item(style)

    spine = ["nav"]
    toc = []

    for ch in chapters:
        chapter_id = f"chapter_{ch.chapter_num}"
        epub_ch = epub.EpubHtml(
            title=f"Chapter {ch.chapter_num}",
            file_name=f"{chapter_id}.xhtml",
            lang="en",
        )
        epub_ch.add_item(style)

        footnotes = ch.footnotes or []
        fn_lookup = _build_footnote_lookup(footnotes)

        html = f"<h2>Chapter {ch.chapter_num} <span class='level-badge'>Level {ch.level}</span></h2>"
        for para in (ch.content or "").split("\n\n"):
            if para.strip():
                html += f"<p>{_green_annotations_with_ipa(para.strip(), fn_lookup)}</p>"

        if footnotes:
            html += "<div class='footnotes'><dl>"
            seen = set()
            for ft in footnotes:
                term = ft.get("term", "")
                if term in seen:
                    continue
                seen.add(term)
                translation = ft.get("translation", "")
                pronunciation = ft.get("pronunciation", "")
                grammar_note = ft.get("grammar_note", "")
                native_script = ft.get("native_script", "")

                dt_parts = [_esc(term)]
                if native_script and native_script != term:
                    dt_parts.append(f" ({_esc(native_script)})")

                dd_parts = [_esc(translation)]
                if pronunciation:
                    dd_parts.append(f" <span class='fn-ipa'>/{_esc(pronunciation)}/</span>")
                if grammar_note:
                    dd_parts.append(f" <span class='fn-grammar'>— {_esc(grammar_note)}</span>")

                html += f"<dt>{''.join(dt_parts)}</dt><dd>{''.join(dd_parts)}</dd>"
            html += "</dl></div>"

        epub_ch.content = html.encode()
        book.add_item(epub_ch)
        spine.append(epub_ch)
        toc.append(epub_ch)

    book.toc = toc
    book.spine = spine
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    buf = io.BytesIO()
    epub.write_epub(buf, book)
    return buf.getvalue()
