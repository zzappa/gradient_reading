"""
Transformation orchestration — progressive 7-part ramp across the book.

- Split source text into exactly seven contiguous story segments (levels 1..7).
- Segment sizes are weighted so levels 1-2 are shorter and levels 3-5 are longer.
- Transform each segment at its assigned level once.
- Persist one chapter per level (chapter_num == level), plus chapter 0 (raw source).

Paragraph-length variability handling for model calls:
- Within each level segment, text is sent in paragraph-respecting call chunks.
- If a paragraph is too large for one call, it is sentence-batched and stitched back.

Notes:
- Continuity context is carried forward via [[CONTINUITY_CONTEXT]].
- VocabularyTracker is updated progressively so terminology remains stable.
"""

import asyncio
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Tuple

from sqlalchemy import delete, select

from models.project import Project
from models.chapter import Chapter
from models.job import TransformationJob
from languages import get_language
from services.text_splitter import split_into_paragraphs
from services.vocabulary import VocabularyTracker
from services.claude import transform_chunk
from prompts.levels import build_transform_prompt

logger = logging.getLogger(__name__)

try:
    import fcntl  # Unix file locking for cross-process transformation safety.
except ImportError:  # pragma: no cover
    fcntl = None

# Target size for model call chunks inside each level segment.
MAX_CHUNK_WORDS = 250
# Safety cap for a single model call. If exceeded, we fall back to per-paragraph or sentence-batched calls.
MAX_CALL_WORDS = 900

# Continuity context size (rolling tail)
CONTEXT_TAIL_WORDS = 140

# Weighted distribution for level segments 1..7.
# 1-2 are shorter; 3-5 are longer.
LEVEL_SEGMENT_WEIGHTS = [0.7, 0.8, 1.25, 1.3, 1.25, 0.95, 0.75]
ACTIVE_JOB_IDS: set[str] = set()

_ANNOTATION_TOLERANT_RE = re.compile(
    r"\{\{([^|]+)\|\}?([^|}]+)(?:\|\}?([^}]*))?\}\}?"
)

_LOCK_DIR = Path(__file__).resolve().parent.parent / "data" / ".locks"


async def run_transformation_guarded(project_id: str, job_id: str, db_factory):
    """Run one job at a time per job_id and make recovery scheduling idempotent."""
    if job_id in ACTIVE_JOB_IDS:
        return
    ACTIVE_JOB_IDS.add(job_id)
    try:
        await run_transformation(project_id, job_id, db_factory)
    finally:
        ACTIVE_JOB_IDS.discard(job_id)


async def _acquire_project_lock(project_id: str):
    """Acquire an exclusive cross-process lock for one project transformation."""
    if fcntl is None:
        return None

    _LOCK_DIR.mkdir(parents=True, exist_ok=True)
    lock_path = _LOCK_DIR / f"transform-{project_id}.lock"
    lock_file = lock_path.open("a+")

    while True:
        try:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            return lock_file
        except BlockingIOError:
            await asyncio.sleep(0.2)


def _release_project_lock(lock_file) -> None:
    if lock_file is None:
        return
    try:
        if fcntl is not None:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
    finally:
        lock_file.close()


async def recover_incomplete_jobs(db_factory):
    """Reschedule jobs that were in-flight before a server restart."""
    async with db_factory() as db:
        result = await db.execute(
            select(TransformationJob).where(
                TransformationJob.status.in_(["running", "processing"])
            )
        )
        jobs = result.scalars().all()

    for job in jobs:
        if job.id in ACTIVE_JOB_IDS:
            continue
        logger.warning("Recovering interrupted transformation job %s", job.id)
        asyncio.create_task(
            run_transformation_guarded(job.project_id, job.id, db_factory)
        )

def _word_count(text: str) -> int:
    return len(text.split())


def _clean_term_token(value: str) -> str:
    token = (value or "").strip()
    token = token.strip("{}").strip()
    if token.startswith("|"):
        token = token[1:].strip()
    if token.endswith("|"):
        token = token[:-1].strip()
    return token


def _normalize_annotation_markup(text: str) -> str:
    """Canonicalize tolerant annotation variants to {{display|base}} form.

    Accepts common malformed variants such as:
    - {{display|}base}
    - {{display|}base|native}
    """
    if not text or "{{" not in text:
        return text

    def _replace(match: re.Match) -> str:
        display = (match.group(1) or "").strip()
        base_form = _clean_term_token(match.group(2) or "")
        native_display = _clean_term_token(match.group(3) or "") if match.group(3) is not None else ""

        if not display or not base_form:
            return display or base_form
        if native_display:
            return f"{{{{{display}|{base_form}|{native_display}}}}}"
        return f"{{{{{display}|{base_form}}}}}"

    return _ANNOTATION_TOLERANT_RE.sub(_replace, text)


def _coerce_transform_result(result: Any) -> dict:
    """Normalize model output to a dict with `paragraphs` and `new_terms` keys."""
    if isinstance(result, dict):
        return result
    if isinstance(result, str):
        text = result.strip()
        paragraphs = [{"text": text, "footnote_refs": []}] if text else []
        return {"paragraphs": paragraphs, "new_terms": []}
    if isinstance(result, list):
        paragraphs = []
        for item in result:
            if isinstance(item, str):
                text = item.strip()
                if text:
                    paragraphs.append({"text": text, "footnote_refs": []})
            elif isinstance(item, dict):
                paragraphs.append(item)
        return {"paragraphs": paragraphs, "new_terms": []}
    return {"paragraphs": [], "new_terms": []}


def _normalize_footnote_refs(value: Any) -> list[str]:
    if isinstance(value, list):
        refs = value
    elif isinstance(value, str):
        refs = [value]
    elif value is None:
        refs = []
    else:
        refs = [str(value)]

    out: list[str] = []
    for ref in refs:
        cleaned = _clean_term_token(ref if isinstance(ref, str) else str(ref))
        if cleaned:
            out.append(cleaned)
    return out


def _normalized_paragraphs(result: dict) -> list[dict]:
    raw = result.get("paragraphs", [])
    if isinstance(raw, list):
        paragraphs = raw
    elif raw is None:
        paragraphs = []
    else:
        paragraphs = [raw]

    out: list[dict] = []
    for para in paragraphs:
        if isinstance(para, str):
            out.append({"text": para, "footnote_refs": []})
            continue
        if not isinstance(para, dict):
            continue

        text_value = para.get("text", "")
        if not isinstance(text_value, str):
            text_value = "" if text_value is None else str(text_value)

        out.append(
            {
                "text": text_value,
                "footnote_refs": _normalize_footnote_refs(para.get("footnote_refs", [])),
            }
        )
    return out


def _expand_units_for_levels(paragraphs: list[str], min_units: int = 7) -> list[str]:
    """Best-effort split into at least min_units contiguous units (sentence-based when needed)."""
    units = [p for p in paragraphs if (p or "").strip()]
    if len(units) >= min_units:
        return units

    while len(units) < min_units:
        split_idx = -1
        split_left = ""
        split_right = ""
        split_words = 0

        for idx, unit in enumerate(units):
            sentences = [s.strip() for s in _SENT_SPLIT_RE.split(unit.strip()) if s.strip()]
            if len(sentences) < 2:
                continue

            mid = len(sentences) // 2
            left = " ".join(sentences[:mid]).strip()
            right = " ".join(sentences[mid:]).strip()
            if not left or not right:
                continue

            words = _word_count(unit)
            if words > split_words:
                split_idx = idx
                split_left = left
                split_right = right
                split_words = words

        if split_idx < 0:
            break

        units = units[:split_idx] + [split_left, split_right] + units[split_idx + 1:]

    return units


def _split_into_level_segments(
    paragraphs: list[str],
    level_weights: list[float] | None = None,
) -> List[Tuple[int, list[str]]]:
    """Split source units into 7 contiguous level segments using weighted targets."""
    weights = level_weights or LEVEL_SEGMENT_WEIGHTS
    num_levels = len(weights)

    if num_levels != 7:
        raise ValueError("Expected exactly 7 level weights.")

    if not paragraphs:
        return [(level, []) for level in range(1, num_levels + 1)]

    n = len(paragraphs)
    if n < num_levels:
        segments: List[Tuple[int, list[str]]] = []
        for level in range(1, num_levels + 1):
            para = [paragraphs[level - 1]] if level <= n else []
            segments.append((level, para))
        return segments

    para_weights = [_word_count(p) for p in paragraphs]
    if sum(para_weights) == 0:
        para_weights = [1] * n

    prefix = [0]
    for w in para_weights:
        prefix.append(prefix[-1] + w)

    total_weight = sum(weights)
    targets = []
    running_weight = 0.0
    for idx in range(num_levels - 1):
        running_weight += weights[idx]
        targets.append((running_weight / total_weight) * prefix[-1])

    boundaries: list[int] = []
    prev = 0
    for boundary_idx, target in enumerate(targets, start=1):
        remaining_segments = num_levels - boundary_idx
        min_cut = prev + 1
        max_cut = n - remaining_segments
        if min_cut > max_cut:
            cut = min_cut
        else:
            cut = min(
                range(min_cut, max_cut + 1),
                key=lambda i: (abs(prefix[i] - target), i),
            )
        boundaries.append(cut)
        prev = cut

    segments: List[Tuple[int, list[str]]] = []
    start = 0
    for level, end in enumerate(boundaries + [n], start=1):
        segments.append((level, paragraphs[start:end]))
        start = end

    return segments


def _chunk_paragraphs(paragraphs: list[str]) -> list[list[str]]:
    """Split paragraphs into chunks of roughly MAX_CHUNK_WORDS words each. Always splits at paragraph boundaries."""
    chunks: list[list[str]] = []
    current_chunk: list[str] = []
    current_words = 0

    for para in paragraphs:
        para_words = _word_count(para)

        # If current chunk is non-empty and adding this para would exceed limit, start a new chunk
        if current_chunk and (current_words + para_words > MAX_CHUNK_WORDS):
            chunks.append(current_chunk)
            current_chunk = [para]
            current_words = para_words
            continue

        # Otherwise, keep accumulating
        current_chunk.append(para)
        current_words += para_words

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


_SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def _split_words_into_batches(text: str, max_words: int) -> List[str]:
    """Hard split text into max_words batches."""
    words = text.split()
    out: List[str] = []
    cur: List[str] = []
    cur_words = 0
    for w in words:
        if cur_words + 1 > max_words and cur:
            out.append(" ".join(cur))
            cur = [w]
            cur_words = 1
        else:
            cur.append(w)
            cur_words += 1
    if cur:
        out.append(" ".join(cur))
    return out


def _split_long_paragraph_into_batches(paragraph: str, max_words: int) -> List[str]:
    """
    Split a too-long paragraph into sentence batches (best effort) such that each batch <= max_words.
    If sentence splitting fails (e.g., no punctuation), fall back to word-batches.
    """
    words_total = _word_count(paragraph)
    if words_total <= max_words:
        return [paragraph]

    sentences = [s.strip() for s in _SENT_SPLIT_RE.split(paragraph.strip()) if s.strip()]
    if len(sentences) <= 1:
        return _split_words_into_batches(paragraph, max_words=max_words)

    # Sentence batching
    out: List[str] = []
    cur_sents: List[str] = []
    cur_words = 0
    for s in sentences:
        s_words = _word_count(s)

        # Sentence is too long by itself -> flush current batch and hard-split sentence.
        if s_words > max_words:
            if cur_sents:
                out.append(" ".join(cur_sents))
                cur_sents = []
                cur_words = 0
            out.extend(_split_words_into_batches(s, max_words=max_words))
            continue

        if cur_sents and (cur_words + s_words > max_words):
            out.append(" ".join(cur_sents))
            cur_sents = [s]
            cur_words = s_words
        else:
            cur_sents.append(s)
            cur_words += s_words

    if cur_sents:
        out.append(" ".join(cur_sents))

    # Ensure progress (guard against pathological splits)
    if len(out) == 1 and _word_count(out[0]) > max_words:
        return _split_long_paragraph_into_batches(paragraph, max_words=max_words // 2 if max_words > 200 else max_words)

    return out


def _update_context_tail(existing_context: str, new_text: str) -> str:
    combined = (existing_context + " " + new_text).strip()
    words = combined.split()
    return " ".join(words[-CONTEXT_TAIL_WORDS:])


def _enrich_footnotes(footnotes: list[dict], vocab_tracker: VocabularyTracker) -> list[dict]:
    """Add translation/explanation/category/grammar_note/pronunciation/native_script from the vocabulary tracker."""
    for ft in footnotes:
        term_key = ft["term"].lower().strip()
        if term_key in vocab_tracker.terms:
            entry = vocab_tracker.terms[term_key]
            ft["translation"] = entry.english
            ft["explanation"] = entry.explanation
            ft["category"] = entry.category
            ft["grammar_note"] = entry.grammar_note
            ft["pronunciation"] = entry.pronunciation
            ft["native_script"] = entry.native_script
    return footnotes


def _ensure_new_terms_for_refs(result: dict) -> List[dict]:
    """
    Defensive: make sure every footnote ref in result["paragraphs"][...]["footnote_refs"]
    has a matching entry in result["new_terms"] (at least a stub).
    Returns the final new_terms list (possibly extended).
    """
    result = _coerce_transform_result(result)
    normalized_new_terms: List[dict] = []
    for term_data in list(result.get("new_terms", []) or []):
        if isinstance(term_data, str):
            normalized_term = _clean_term_token(term_data)
            if normalized_term:
                normalized_new_terms.append(
                    {
                        "term": normalized_term,
                        "translation": normalized_term,
                        "explanation": "",
                        "category": "other",
                        "grammar_note": "",
                        "pronunciation": "",
                        "native_script": "",
                    }
                )
            continue
        if not isinstance(term_data, dict):
            continue
        normalized_term = _clean_term_token(term_data.get("term", ""))
        if not normalized_term:
            continue
        fixed = dict(term_data)
        fixed["term"] = normalized_term
        normalized_new_terms.append(fixed)

    new_terms = normalized_new_terms
    term_lookup = {t.get("term", "").lower().strip(): t for t in new_terms if t.get("term")}

    refs: List[str] = []
    for para_data in _normalized_paragraphs(result):
        for ref in para_data["footnote_refs"]:
            cleaned_ref = _clean_term_token(ref)
            r = cleaned_ref.lower().strip()
            if r and r not in term_lookup and r not in [x.lower().strip() for x in refs]:
                refs.append(cleaned_ref)

    if refs:
        missing = [r for r in refs if (r.lower().strip() not in term_lookup)]
        for ref in missing:
            stub = {
                "term": ref,
                "translation": ref,
                "explanation": "",
                "category": "other",
                "grammar_note": "",
                "pronunciation": "",
                "native_script": "",
            }
            key = ref.lower().strip()
            term_lookup[key] = stub
            new_terms.append(stub)

    return new_terms


def _collect_chunk_outputs(
    result: dict,
    vocab_tracker: VocabularyTracker,
    paragraph_index_offset: int,
) -> Tuple[List[str], List[dict], List[dict]]:
    """
    From a transform_chunk result, produce:
      - transformed paragraph texts
      - footnotes with correct paragraph_index (offset applied)
      - new_terms list (defensively completed)
    """
    result = _coerce_transform_result(result)
    new_terms = _ensure_new_terms_for_refs(result)
    # Build lookup for enrichment (immediate)
    chunk_term_data = {t.get("term", "").lower().strip(): t for t in new_terms if t.get("term")}

    out_paras: List[str] = []
    out_footnotes: List[dict] = []

    for local_idx, para_data in enumerate(_normalized_paragraphs(result)):
        text = _normalize_annotation_markup(para_data["text"] or "")
        out_paras.append(text)

        global_para_index = paragraph_index_offset + local_idx
        for raw_ref in para_data["footnote_refs"]:
            ref = _clean_term_token(raw_ref)
            if not ref:
                continue

            ref_key = ref.lower().strip()
            fn = {"term": ref, "paragraph_index": global_para_index}

            # Immediate enrichment from chunk_term_data (optional but keeps your old behavior)
            td = chunk_term_data.get(ref_key)
            if td:
                fn["translation"] = td.get("translation", "")
                fn["explanation"] = td.get("explanation", "")
                fn["category"] = td.get("category", "")
                fn["grammar_note"] = td.get("grammar_note", "")
                fn["pronunciation"] = td.get("pronunciation", "")
                fn["native_script"] = td.get("native_script", "")

            out_footnotes.append(fn)

    return out_paras, out_footnotes, new_terms


def _continuity_context_block(context_tail: str) -> str:
    if not context_tail.strip():
        return ""
    return f"[[CONTINUITY_CONTEXT]]\n{context_tail.strip()}\n"


_NATIVE_SCRIPT_PATTERNS = {
    "ru": re.compile(r"[\u0400-\u04FF]"),  # Cyrillic
    "he": re.compile(r"[\u0590-\u05FF]"),  # Hebrew
    "ar": re.compile(r"[\u0600-\u06FF]"),  # Arabic
    "ja": re.compile(r"[\u3040-\u30FF\u3400-\u9FFF]"),  # Hiragana/Katakana/CJK
    "zh": re.compile(r"[\u3400-\u9FFF]"),  # CJK
    "ko": re.compile(r"[\u1100-\u11FF\uAC00-\uD7AF]"),  # Hangul Jamo/Syllables
}

_NON_ASCII_ROMANIZATION_MARKERS = {
    # Enforce ASCII Hepburn-style output in paragraph text.
    "ja": re.compile(r"[ĀāĒēĪīŌōŪū]"),
    # Enforce plain pinyin letters (no tones/diacritics).
    "zh": re.compile(r"[ĀāÁáǍǎÀàĒēÉéĚěÈèĪīÍíǏǐÌìŌōÓóǑǒÒòŪūÚúǓǔÙùǕǖǗǘǙǚǛǜŃńŇňḾḿ]"),
    # Enforce Revised Romanization (no breves).
    "ko": re.compile(r"[ŎŏŬŭ]"),
    # Disallow mixed scientific/diacritic translit in chapter text.
    "ru": re.compile(r"[ŠšČčŽžËë]"),
    "he": re.compile(r"[ḤḥṢṣṬṭʿʾ]"),
    "ar": re.compile(r"[ḤḥṢṣṬṭḌḍẒẓʿʾ]"),
}


def _result_text(result: dict) -> str:
    result = _coerce_transform_result(result)
    paragraphs = _normalized_paragraphs(result)
    return " ".join((p["text"] or "") for p in paragraphs).strip()


def _romanization_issues(result: dict, lang_code: str, source_lang_code: str = "en") -> List[str]:
    if lang_code not in _NATIVE_SCRIPT_PATTERNS:
        return []

    text = _result_text(result)
    if not text:
        return []

    issues: List[str] = []

    source_is_latin = True
    try:
        source_is_latin = get_language(source_lang_code).get("script") == "latin"
    except Exception:
        source_is_latin = True

    native_script_re = _NATIVE_SCRIPT_PATTERNS.get(lang_code)
    if source_is_latin and native_script_re and native_script_re.search(text):
        issues.append("native-script characters found in paragraph text")

    marker_re = _NON_ASCII_ROMANIZATION_MARKERS.get(lang_code)
    if marker_re and marker_re.search(text):
        issues.append("non-standard/diacritic romanization markers detected")

    return issues


def _romanization_retry_hint(lang_code: str, issues: List[str]) -> str:
    joined = "; ".join(issues)
    return (
        f"- Previous output had romanization issues for '{lang_code}': {joined}.\n"
        "- Regenerate the SAME passage with the same meaning and paragraph structure.\n"
        "- Use the romanization standard specified in this prompt consistently.\n"
        "- Keep output in Latin script only in paragraph text.\n"
    )


async def run_transformation(project_id: str, job_id: str, db_factory):
    """
    Progressive transformation pipeline:
    - Save Chapter 0: full raw source text.
    - Split source into exactly 7 contiguous segments (levels 1..7) using weighted sizing.
    - Transform each segment at its assigned level and persist as Chapter[level].
    """
    project_lock = await _acquire_project_lock(project_id)
    try:
        async with db_factory() as db:
            project = await db.get(Project, project_id)
            job = await db.get(TransformationJob, job_id)
            if not project or not job:
                return

            vocab_tracker = VocabularyTracker.from_dict(project.vocabulary)

            project.status = "processing"
            job.status = "processing"
            job.error_message = None
            job.completed_at = None
            await db.commit()

            # Always rebuild chapters from scratch for this job.
            await db.execute(delete(Chapter).where(Chapter.project_id == project_id))
            await db.commit()

            # Chapter 0: full raw source
            chapter_0 = Chapter(
                project_id=project_id,
                chapter_num=0,
                level=0,
                source_text=project.source_text,
                content=project.source_text,
                footnotes=[],
                status="completed",
            )
            db.add(chapter_0)
            await db.commit()

            # Split into contiguous source units and assign exactly 7 level segments.
            original_paragraphs = split_into_paragraphs(project.source_text)
            source_units = _expand_units_for_levels(original_paragraphs, min_units=7)
            segments = _split_into_level_segments(source_units, level_weights=LEVEL_SEGMENT_WEIGHTS)

            # Total chapters = raw + 7 transformed levels.
            job.total_chapters = 8
            job.current_chapter = 1
            job.completed_chapters = 1
            await db.commit()

            # Rolling continuity context (tail of prior generated text)
            continuity_tail = ""

            # Process each level segment as its own Chapter keyed by level.
            for seg_idx, (level, seg_paras) in enumerate(segments):
                job.current_chapter = 2 + seg_idx
                await db.commit()

                seg_source_text = "\n\n".join(seg_paras).strip()

                chapter = Chapter(
                    project_id=project_id,
                    chapter_num=level,   # keep compatibility with old "chapter_num == level"
                    level=level,
                    source_text=seg_source_text,
                    status="processing",
                )
                db.add(chapter)
                await db.commit()

                if not seg_paras:
                    chapter.content = ""
                    chapter.footnotes = []
                    chapter.status = "completed"
                    await db.commit()
                    job.completed_chapters = 2 + seg_idx
                    await db.commit()
                    continue

                seg_chunks = _chunk_paragraphs(seg_paras)
                chapter_paragraphs: List[str] = []
                chapter_footnotes: List[dict] = []
                chapter_failed = False

                for orig_chunk_paras in seg_chunks:
                    chunk_text = "\n\n".join(orig_chunk_paras).strip()
                    if not chunk_text:
                        continue

                    # Decide whether to do one call for the chunk or fall back to safer per-paragraph processing
                    chunk_words = _word_count(chunk_text)
                    any_para_too_big = any(_word_count(p) > MAX_CALL_WORDS for p in orig_chunk_paras)

                    def _build_prompt(quality_hint: str = "") -> str:
                        return build_transform_prompt(
                            level=level,
                            vocab_tracker=vocab_tracker,
                            lang_code=project.target_language,
                            source_lang_code=getattr(project, "source_language", "en"),
                            context=_continuity_context_block(continuity_tail),
                            quality_hint=quality_hint,
                        )

                    async def _transform_with_quality_retry(input_text: str) -> dict | None:
                        system_prompt = _build_prompt()
                        result = await transform_chunk(system_prompt, input_text, level=level)
                        if result is None:
                            return None
                        result = _coerce_transform_result(result)

                        issues = _romanization_issues(
                            result,
                            project.target_language,
                            getattr(project, "source_language", "en"),
                        )
                        if not issues:
                            return result

                        retry_prompt = _build_prompt(
                            quality_hint=_romanization_retry_hint(project.target_language, issues)
                        )
                        retried = await transform_chunk(retry_prompt, input_text, level=level)
                        return _coerce_transform_result(retried) if retried is not None else result

                    if chunk_words <= MAX_CALL_WORDS and not any_para_too_big:
                        # Single call for whole chunk
                        result = await _transform_with_quality_retry(chunk_text)
                        if result is None:
                            chapter_failed = True
                            break

                        para_offset = len(chapter_paragraphs)
                        out_paras, out_footnotes, new_terms = _collect_chunk_outputs(
                            result=result,
                            vocab_tracker=vocab_tracker,
                            paragraph_index_offset=para_offset,
                        )

                        chapter_paragraphs.extend(out_paras)
                        chapter_footnotes.extend(out_footnotes)
                        vocab_tracker.add_terms(new_terms, level)

                        # Update continuity tail from latest generated text
                        if out_paras:
                            continuity_tail = _update_context_tail(continuity_tail, " ".join(out_paras[-2:]))

                    else:
                        # Safer path: process paragraph-by-paragraph (and batch if a paragraph is huge)
                        for para in orig_chunk_paras:
                            para = (para or "").strip()
                            if not para:
                                # preserve empty-ish paragraph as empty paragraph
                                chapter_paragraphs.append("")
                                continue

                            para_words = _word_count(para)

                            if para_words <= MAX_CALL_WORDS:
                                # One call for this paragraph
                                result = await _transform_with_quality_retry(para)
                                if result is None:
                                    chapter_failed = True
                                    break

                                para_offset = len(chapter_paragraphs)
                                out_paras, out_footnotes, new_terms = _collect_chunk_outputs(
                                    result=result,
                                    vocab_tracker=vocab_tracker,
                                    paragraph_index_offset=para_offset,
                                )

                                # Expect exactly 1 paragraph back; but handle defensively
                                if out_paras:
                                    chapter_paragraphs.extend(out_paras)
                                else:
                                    chapter_paragraphs.append("")

                                chapter_footnotes.extend(out_footnotes)
                                vocab_tracker.add_terms(new_terms, level)

                                if out_paras:
                                    continuity_tail = _update_context_tail(continuity_tail, out_paras[-1])

                            else:
                                # Too-long paragraph: sentence-batched calls, stitched into ONE paragraph output
                                para_index = len(chapter_paragraphs)
                                chapter_paragraphs.append("")  # placeholder to keep paragraph structure

                                combined_text_parts: List[str] = []

                                batches = _split_long_paragraph_into_batches(para, max_words=MAX_CALL_WORDS)
                                for batch in batches:
                                    result = await _transform_with_quality_retry(batch)
                                    if result is None:
                                        chapter_failed = True
                                        break

                                    # For stitched batching, we force paragraph_index to be para_index (single paragraph)
                                    new_terms = _ensure_new_terms_for_refs(result)
                                    vocab_tracker.add_terms(new_terms, level)

                                    paras = _normalized_paragraphs(_coerce_transform_result(result))
                                    if paras:
                                        batch_text = _normalize_annotation_markup(
                                            paras[0]["text"] or ""
                                        )
                                        combined_text_parts.append(batch_text)
                                        continuity_tail = _update_context_tail(continuity_tail, batch_text)

                                        for raw_ref in paras[0]["footnote_refs"]:
                                            ref = _clean_term_token(raw_ref)
                                            if ref:
                                                chapter_footnotes.append(
                                                    {"term": ref, "paragraph_index": para_index}
                                                )
                                    else:
                                        # no paragraph returned; ignore
                                        pass

                                if chapter_failed:
                                    break

                                chapter_paragraphs[para_index] = " ".join([p for p in combined_text_parts if p]).strip()

                        if chapter_failed:
                            break

                if chapter_failed:
                    chapter.status = "failed"
                    await db.commit()
                    job.status = "failed"
                    job.error_message = f"Failed while processing level {level}."
                    job.completed_at = datetime.now(timezone.utc)
                    project.status = "failed"
                    await db.commit()
                    return

                # Finalize this level chapter
                chapter_footnotes = _enrich_footnotes(chapter_footnotes, vocab_tracker)
                chapter.content = "\n\n".join(chapter_paragraphs)
                chapter.footnotes = chapter_footnotes
                chapter.status = "completed"
                await db.commit()

                job.completed_chapters = 2 + seg_idx
                await db.commit()

            # Save vocabulary back to project
            project.vocabulary = vocab_tracker.to_dict()
            project.status = "completed"
            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            job.completed_chapters = job.total_chapters
            await db.commit()
    except Exception as e:
        logger.error("Transformation failed for project %s: %s", project_id, e)
        async with db_factory() as db:
            job = await db.get(TransformationJob, job_id)
            project = await db.get(Project, project_id)
            if job:
                job.status = "failed"
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)
            if project:
                project.status = "failed"
            if job or project:
                await db.commit()
    finally:
        _release_project_lock(project_lock)
