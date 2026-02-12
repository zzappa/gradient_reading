"""Comprehension check endpoints — generate questions and evaluate answers."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models.project import Project
from models.chapter import Chapter
from schemas.comprehension import (
    GenerateRequest, GenerateResponse,
    EvaluateRequest, EvaluateResponse,
)
from services.claude import generate_comprehension, evaluate_answer
from languages import get_language, get_source_language_name

router = APIRouter(prefix="/api/projects/{project_id}/comprehension", tags=["comprehension"])


async def _get_chapter(db, project_id: str, level: int) -> Chapter | None:
    result = await db.execute(
        select(Chapter).where(
            Chapter.project_id == project_id,
            Chapter.chapter_num == level,
        ).order_by(Chapter.created_at.desc()).limit(1)
    )
    return result.scalar_one_or_none()


def _format_footnotes(chapter: Chapter) -> str:
    """Format footnotes into a readable list for the prompt."""
    footnotes = chapter.footnotes or []
    if not footnotes:
        return "(none)"
    seen = set()
    lines = []
    for fn in footnotes:
        term = fn.get("term", "")
        if term.lower() in seen:
            continue
        seen.add(term.lower())
        translation = fn.get("translation", "")
        grammar = fn.get("grammar_note", "")
        parts = [term]
        if translation:
            parts.append(f"= {translation}")
        if grammar:
            parts.append(f"({grammar})")
        lines.append("- " + " ".join(parts))
    return "\n".join(lines) if lines else "(none)"


@router.post("/generate", response_model=GenerateResponse)
async def generate_questions(
    project_id: str,
    body: GenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chapter = await _get_chapter(db, project_id, body.level)
    if not chapter or not chapter.content:
        raise HTTPException(status_code=404, detail="Chapter not found")

    # Also fetch previous level for comparison context
    prev_chapter = None
    if body.level > 0:
        prev_chapter = await _get_chapter(db, project_id, body.level - 1)

    lang = get_language(project.target_language)
    target_name = lang["name"]
    source_name = get_source_language_name(project.source_language)

    new_terms = _format_footnotes(chapter)

    system_prompt = (
        f"You are a quiz generator for a gradient immersion language learning app. "
        f"The student is learning {target_name} from {source_name}. "
        f"They are reading a text at level {body.level}/7, where the text gradually "
        f"transitions from {source_name} to {target_name}.\n\n"
        f"ALWAYS write ALL questions in English. The student may not be able to read {target_name} script.\n\n"
        f"Generate exactly 4 short-answer questions that test:\n"
        f"1. TEXT COMPREHENSION — can the student follow the story/content at this level?\n"
        f"2. VOCABULARY — ask what specific {target_name} words from this level mean "
        f"(quote the word in the question so the student can identify it)\n"
        f"3. GRAMMAR — ask about a grammar pattern introduced at this level "
        f"(e.g. why a verb has a certain form, what a particle means)\n"
        f"4. CONTEXT INFERENCE — ask the student to infer meaning of a {target_name} "
        f"phrase from surrounding context\n\n"
        f"Keep questions concise. Include the {target_name} word/phrase in quotes when referencing it.\n\n"
        f"NEW {target_name.upper()} TERMS INTRODUCED AT THIS LEVEL:\n{new_terms}"
    )

    # Build the content to pass
    content_parts = [f"CURRENT LEVEL {body.level} TEXT:\n{chapter.content[:3000]}"]
    if prev_chapter and prev_chapter.content:
        content_parts.append(f"\nPREVIOUS LEVEL {body.level - 1} TEXT (for comparison):\n{prev_chapter.content[:2000]}")

    questions = await generate_comprehension(system_prompt, "\n".join(content_parts))
    if not questions:
        raise HTTPException(status_code=500, detail="Failed to generate questions")

    return GenerateResponse(questions=questions)


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(
    project_id: str,
    body: EvaluateRequest,
    db: AsyncSession = Depends(get_db),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    chapter = await _get_chapter(db, project_id, body.level)
    if not chapter or not chapter.content:
        raise HTTPException(status_code=404, detail="Chapter not found")

    lang = get_language(project.target_language)
    target_name = lang["name"]
    source_name = get_source_language_name(project.source_language)

    new_terms = _format_footnotes(chapter)

    system_prompt = (
        f"You are evaluating a language student's answer. "
        f"The student is learning {target_name} from {source_name} at level {body.level}/7. "
        f"Be encouraging but accurate. Accept answers in any language. "
        f"The answer is correct if it demonstrates understanding, even if phrasing is imperfect. "
        f"Give brief, helpful feedback in English. If wrong, explain the correct answer.\n\n"
        f"TERMS AT THIS LEVEL:\n{new_terms}\n\n"
        f"TEXT (first 2000 chars):\n{chapter.content[:2000]}"
    )

    evaluation = await evaluate_answer(system_prompt, body.question, body.answer)
    if not evaluation:
        raise HTTPException(status_code=500, detail="Failed to evaluate answer")

    return EvaluateResponse(
        correct=evaluation.get("correct", False),
        feedback=evaluation.get("feedback", ""),
    )
