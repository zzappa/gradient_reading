"""Dictionary endpoints — aggregate vocabulary from user projects."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.project import Project

router = APIRouter(prefix="/api/dictionary", tags=["dictionary"])


@router.get("/languages")
async def get_dictionary_languages(
    user_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project.target_language).where(
            Project.user_id == user_id,
            Project.vocabulary.isnot(None),
        )
    )
    languages = sorted({row[0] for row in result.all() if row[0]})
    return {"languages": languages}


@router.get("")
async def get_dictionary(
    user_id: str = Query(...),
    language: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Project).where(
        Project.user_id == user_id,
        Project.vocabulary.isnot(None),
    )
    if language:
        query = query.where(Project.target_language == language)

    result = await db.execute(query)
    projects = result.scalars().all()

    seen = set()
    terms = []

    for proj in projects:
        vocab = proj.vocabulary or {}
        for key, entry in vocab.items():
            dedup_key = (key, proj.target_language)
            if dedup_key in seen:
                continue
            seen.add(dedup_key)
            terms.append({
                "term_key": key,
                "term": entry.get("spanish", key),
                "translation": entry.get("english", ""),
                "pronunciation": entry.get("pronunciation", ""),
                "grammar_note": entry.get("grammar_note", ""),
                "category": entry.get("category", ""),
                "native_script": entry.get("native_script", ""),
                "explanation": entry.get("explanation", ""),
                "language": proj.target_language,
                "project_id": proj.id,
                "project_title": proj.title,
                "first_chapter": entry.get("first_chapter", 0),
            })

    return {"terms": terms}
