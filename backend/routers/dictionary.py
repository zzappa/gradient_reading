"""Dictionary endpoint — aggregate vocabulary from all user projects."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.project import Project

router = APIRouter(prefix="/api/dictionary", tags=["dictionary"])


@router.get("")
async def get_dictionary(user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(
            Project.user_id == user_id,
            Project.vocabulary.isnot(None),
        )
    )
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
