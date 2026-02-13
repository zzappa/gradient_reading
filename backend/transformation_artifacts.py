"""Persistence helpers for per-project transformation snapshots."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.chapter import Chapter
from models.project import Project

TRANSFORMATIONS_DIR = Path(__file__).resolve().parent.parent / "transformations"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _datetime_iso(value: datetime | None) -> str:
    if value is None:
        return _utc_now_iso()
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def build_project_snapshot(project: Project, chapters: list[Chapter]) -> dict[str, Any]:
    return {
        "id": project.id,
        "title": project.title,
        "target_language": project.target_language,
        "source_language": project.source_language,
        "source_text": project.source_text,
        "start_level": project.start_level,
        "status": project.status,
        "created_at": _datetime_iso(project.created_at),
        "vocabulary": project.vocabulary or {},
        "chapters": [
            {
                "chapter_num": chapter.chapter_num,
                "level": chapter.level,
                "source_text": chapter.source_text,
                "content": chapter.content,
                "footnotes": chapter.footnotes or [],
                "status": chapter.status,
                "created_at": _datetime_iso(chapter.created_at),
            }
            for chapter in chapters
        ],
    }


async def _load_project_chapters(db: AsyncSession, project_id: str) -> list[Chapter]:
    result = await db.execute(
        select(Chapter)
        .where(Chapter.project_id == project_id)
        .order_by(Chapter.chapter_num, Chapter.created_at)
    )
    return result.scalars().all()


async def save_project_snapshot(
    db: AsyncSession,
    project: Project,
    include_chapters: bool = True,
) -> Path:
    chapters = await _load_project_chapters(db, project.id) if include_chapters else []
    payload = build_project_snapshot(project, chapters)
    output_path = TRANSFORMATIONS_DIR / f"{project.id}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return output_path
