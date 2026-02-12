"""
Transformation orchestration — progressive ramp across the book.

- Split the source into paragraph-respecting chunks (~MAX_CHUNK_WORDS).
- Assign each chunk a single difficulty level on a monotone schedule (Level 1 -> ... -> Level 7).
- Transform each chunk ONCE at its assigned level.
- Persist results as Chapters keyed by level (chapter_num == level), where each chapter contains
  the contiguous segment of the story produced at that level.
- Chapter 0 remains the full raw source text (unchanged).

Paragraph-length variability handling:
- Chunks are built on paragraph boundaries (as before).
- If a single paragraph is too large for one model call, it is processed in sentence-batches
  and then stitched back into ONE output paragraph (so paragraph structure is preserved).

Notes:
- Context is carried forward for continuity via [[CONTINUITY_CONTEXT]] only.
- VocabularyTracker is updated progressively so terms stabilize across later chunks.
"""

import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import List, Tuple

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

# Target size for story chunks that advance the level schedule
MAX_CHUNK_WORDS = 250
# Safety cap for a single model call. If exceeded, we fall back to per-paragraph or sentence-batched calls.
MAX_CALL_WORDS = 900

# Continuity context size (rolling tail)
CONTEXT_TAIL_WORDS = 140

MIN_CHUNKS_PER_BOOK = 14
ACTIVE_JOB_IDS: set[str] = set()


async def run_transformation_guarded(project_id: str, job_id: str, db_factory):
    """Run one job at a time per job_id and make recovery scheduling idempotent."""
    if job_id in ACTIVE_JOB_IDS:
        return
    ACTIVE_JOB_IDS.add(job_id)
    try:
        await run_transformation(project_id, job_id, db_factory)
    finally:
        ACTIVE_JOB_IDS.discard(job_id)


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


def _smoothstep(x: float) -> float:
    """Easing: slow start, faster mid, slow end. Monotone on [0, 1]."""
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    return x * x * (3.0 - 2.0 * x)


def _level_schedule(num_chunks: int) -> list[int]:
    """
    Monotone schedule with minimal skipping.

    Properties:
    - Always starts at 1 and ends at 7 (unless num_chunks==0).
    - If num_chunks >= 7 => includes every level 1..7 at least once.
    - If num_chunks < 7 => distributes levels as evenly as possible (no big early duplicates).
      Example: num_chunks=5 => [1,2,3,5,7]
    """
    if num_chunks <= 0:
        return []
    if num_chunks == 1:
        return [7]

    levels: list[int] = []
    for i in range(num_chunks):
        # Bucket chunks into 7 level-bins uniformly across the book.
        # i * 7 / num_chunks yields 0..(7-ε), floor => 0..6.
        lvl = 1 + int((i * 7) / num_chunks)
        if lvl < 1:
            lvl = 1
        if lvl > 7:
            lvl = 7
        levels.append(lvl)

    # Force last to 7
    levels[-1] = 7

    # Enforce monotonicity (defensive)
    for i in range(1, len(levels)):
        if levels[i] < levels[i - 1]:
            levels[i] = levels[i - 1]

    return levels


def _group_by_level(levels: List[int]) -> List[Tuple[int, int, int]]:
    """
    Given a per-chunk level list, return contiguous segments as tuples:
      (level, start_idx_inclusive, end_idx_exclusive)
    """
    if not levels:
        return []
    segments: List[Tuple[int, int, int]] = []
    cur_level = levels[0]
    start = 0
    for i, lvl in enumerate(levels):
        if lvl != cur_level:
            segments.append((cur_level, start, i))
            cur_level = lvl
            start = i
    segments.append((cur_level, start, len(levels)))
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
    new_terms = list(result.get("new_terms", []) or [])
    term_lookup = {t.get("term", "").lower().strip(): t for t in new_terms if t.get("term")}

    refs: List[str] = []
    for para_data in result.get("paragraphs", []) or []:
        for ref in para_data.get("footnote_refs", []) or []:
            r = (ref or "").lower().strip()
            if r and r not in term_lookup and r not in [x.lower().strip() for x in refs]:
                refs.append(ref)

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
    new_terms = _ensure_new_terms_for_refs(result)
    # Build lookup for enrichment (immediate)
    chunk_term_data = {t.get("term", "").lower().strip(): t for t in new_terms if t.get("term")}

    out_paras: List[str] = []
    out_footnotes: List[dict] = []

    for local_idx, para_data in enumerate(result.get("paragraphs", []) or []):
        text = para_data.get("text", "") or ""
        out_paras.append(text)

        global_para_index = paragraph_index_offset + local_idx
        for ref in para_data.get("footnote_refs", []) or []:
            ref_key = (ref or "").lower().strip()
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
    paragraphs = result.get("paragraphs", []) or []
    return " ".join((p.get("text", "") or "") for p in paragraphs).strip()


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
    - Split source into paragraph chunks.
    - Assign each chunk a single level (1..7) along the book.
    - Group contiguous chunks with the same level -> create one Chapter per level segment.
    - Transform each chunk once at its assigned level and append into that chapter's content.
    """
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

        try:
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

            # Split into paragraphs and chunks
            original_paragraphs = split_into_paragraphs(project.source_text)
            chunks = _chunk_paragraphs(original_paragraphs)

            # Level schedule & segments
            chunk_levels = _level_schedule(len(chunks))
            segments = _group_by_level(chunk_levels)

            # Total chapters = raw + number of level segments (usually <= 7)
            job.total_chapters = 1 + len(segments)
            job.current_chapter = 1
            job.completed_chapters = 1
            await db.commit()

            # Rolling continuity context (tail of prior generated text)
            continuity_tail = ""

            # Process each segment as its own Chapter keyed by level
            for seg_idx, (level, start_chunk, end_chunk) in enumerate(segments):
                job.current_chapter = 2 + seg_idx
                await db.commit()

                seg_chunks = chunks[start_chunk:end_chunk]
                seg_source_text = "\n\n".join(["\n\n".join(c) for c in seg_chunks]).strip()

                chapter = Chapter(
                    project_id=project_id,
                    chapter_num=level,   # keep compatibility with old "chapter_num == level"
                    level=level,
                    source_text=seg_source_text,
                    status="processing",
                )
                db.add(chapter)
                await db.commit()

                chapter_paragraphs: List[str] = []
                chapter_footnotes: List[dict] = []
                chapter_failed = False

                for chunk_idx_within_seg, orig_chunk_paras in enumerate(seg_chunks):
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
                        return retried if retried is not None else result

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

                                    paras = result.get("paragraphs", []) or []
                                    if paras:
                                        batch_text = paras[0].get("text", "") or ""
                                        combined_text_parts.append(batch_text)
                                        continuity_tail = _update_context_tail(continuity_tail, batch_text)

                                        for ref in paras[0].get("footnote_refs", []) or []:
                                            chapter_footnotes.append({"term": ref, "paragraph_index": para_index})
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
                    job.error_message = f"Failed while processing level segment {level}."
                    job.completed_at = datetime.now(timezone.utc)
                    project.status = "failed"
                    await db.commit()
                    return

                # Finalize this level segment chapter
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
            job.status = "failed"
            job.error_message = str(e)
            job.completed_at = datetime.now(timezone.utc)
            project.status = "failed"
            await db.commit()
