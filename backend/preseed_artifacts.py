"""Artifact helpers for preseeded sample projects.

This module stores and loads transformed sample projects so app startup can
preload them without calling model APIs.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from languages import get_language
from models.chapter import Chapter
from models.job import TransformationJob
from models.project import Project
from models.user import User

ARTIFACT_SCHEMA_VERSION = 1
ARTIFACT_NAME = "a_scandal_in_bohemia_all_languages"

PRESEED_USER_ID = "00000000-0000-0000-0000-000000000010"
PRESEED_USER_NAME = "Test User"

PRESEED_ARTIFACT_PATH = Path(__file__).resolve().parent / "artifacts" / "a-scandal-in-bohemia.json"
PRESEED_SOURCE_PATH = Path(__file__).resolve().parent.parent / "samples" / "a-scandal-in-bohemia.md"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str) and value.strip():
        text = value.strip().replace("Z", "+00:00")
        try:
            dt = datetime.fromisoformat(text)
        except ValueError:
            dt = datetime.now(timezone.utc)
    else:
        dt = datetime.now(timezone.utc)

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def build_preseed_project_id(target_language: str, source_language: str = "en") -> str:
    key = f"gradient-reading:preseed:{ARTIFACT_NAME}:{source_language}:{target_language}"
    return str(uuid5(NAMESPACE_URL, key))


def build_preseed_project_title(target_language: str) -> str:
    lang_name = get_language(target_language)["name"]
    return f"A Scandal in Bohemia [{lang_name}]"


def load_artifact(path: Path = PRESEED_ARTIFACT_PATH) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        raw = path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    if data.get("schema_version") != ARTIFACT_SCHEMA_VERSION:
        return None
    projects = data.get("projects")
    if not isinstance(projects, list):
        return None
    return data


def save_artifact(data: dict[str, Any], path: Path = PRESEED_ARTIFACT_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def empty_artifact(source_text: str, source_path: Path = PRESEED_SOURCE_PATH) -> dict[str, Any]:
    try:
        source_path_value = str(source_path.relative_to(source_path.parent.parent))
    except ValueError:
        source_path_value = str(source_path)

    return {
        "schema_version": ARTIFACT_SCHEMA_VERSION,
        "artifact": ARTIFACT_NAME,
        "source_language": "en",
        "source_path": source_path_value,
        "generated_at": _utc_now_iso(),
        "source_text": source_text,
        "projects": [],
    }


def _normalize_project_payload(project_data: dict[str, Any], source_text_fallback: str) -> dict[str, Any]:
    target_language = str(project_data.get("target_language", "")).strip()
    source_language = str(project_data.get("source_language") or "en").strip() or "en"
    project_id = str(project_data.get("id") or build_preseed_project_id(target_language, source_language))

    return {
        "id": project_id,
        "title": str(project_data.get("title") or build_preseed_project_title(target_language)),
        "target_language": target_language,
        "source_language": source_language,
        "source_text": str(project_data.get("source_text") or source_text_fallback),
        "start_level": int(project_data.get("start_level", 0)),
        "status": str(project_data.get("status") or "completed"),
        "created_at": project_data.get("created_at") or _utc_now_iso(),
        "vocabulary": project_data.get("vocabulary") or {},
        "chapters": list(project_data.get("chapters") or []),
    }


async def _ensure_preseed_user(db: AsyncSession) -> User:
    user = await db.get(User, PRESEED_USER_ID)
    if user:
        if user.name != PRESEED_USER_NAME:
            user.name = PRESEED_USER_NAME
        if user.levels is None:
            user.levels = {}
        await db.flush()
        return user

    user = User(id=PRESEED_USER_ID, name=PRESEED_USER_NAME, levels={})
    db.add(user)
    await db.flush()
    return user


async def preseed_projects_from_artifact(
    db: AsyncSession,
    path: Path = PRESEED_ARTIFACT_PATH,
    prune_missing: bool = False,
) -> dict[str, Any]:
    await _ensure_preseed_user(db)
    artifact = load_artifact(path)
    if not artifact:
        await db.commit()
        return {
            "loaded": False,
            "reason": f"artifact not found or invalid: {path}",
            "user_ensured": True,
        }

    source_text = str(artifact.get("source_text") or "")
    project_payloads = [
        _normalize_project_payload(p, source_text)
        for p in artifact.get("projects", [])
        if isinstance(p, dict) and str(p.get("target_language", "")).strip()
    ]

    desired_ids = {p["id"] for p in project_payloads}
    seeded_projects = 0
    seeded_chapters = 0
    skipped_processing = 0

    if prune_missing:
        # Optional strict mode: remove preseed projects not in artifact, but never
        # touch projects that are currently transforming.
        existing = await db.execute(select(Project).where(Project.user_id == PRESEED_USER_ID))
        for proj in existing.scalars().all():
            if proj.id in desired_ids:
                continue

            running_job = await db.execute(
                select(TransformationJob.id).where(
                    TransformationJob.project_id == proj.id,
                    TransformationJob.status.in_(["running", "processing"]),
                ).limit(1)
            )
            project_is_busy = bool(running_job.scalar_one_or_none()) or proj.status == "processing"
            if project_is_busy:
                skipped_processing += 1
                continue

            await db.delete(proj)
        await db.flush()

    for payload in project_payloads:
        project = await db.get(Project, payload["id"])

        running_job = await db.execute(
            select(TransformationJob.id).where(
                TransformationJob.project_id == payload["id"],
                TransformationJob.status.in_(["running", "processing"]),
            ).limit(1)
        )
        project_is_busy = bool(running_job.scalar_one_or_none()) or (
            project is not None and project.status == "processing"
        )
        if project_is_busy:
            skipped_processing += 1
            continue

        if project is None:
            project = Project(
                id=payload["id"],
                user_id=PRESEED_USER_ID,
                title=payload["title"],
                target_language=payload["target_language"],
                source_language=payload["source_language"],
                source_text=payload["source_text"],
                start_level=payload["start_level"],
                vocabulary=payload["vocabulary"],
                status=payload["status"],
                created_at=_parse_datetime(payload["created_at"]),
            )
            db.add(project)
        else:
            project.user_id = PRESEED_USER_ID
            project.title = payload["title"]
            project.target_language = payload["target_language"]
            project.source_language = payload["source_language"]
            project.source_text = payload["source_text"]
            project.start_level = payload["start_level"]
            project.vocabulary = payload["vocabulary"]
            project.status = payload["status"]
            project.created_at = _parse_datetime(payload["created_at"])

        await db.flush()

        await db.execute(delete(Chapter).where(Chapter.project_id == project.id))
        for chapter_data in payload["chapters"]:
            chapter = Chapter(
                project_id=project.id,
                chapter_num=int(chapter_data.get("chapter_num", 0)),
                level=int(chapter_data.get("level", 0)),
                source_text=str(chapter_data.get("source_text", "")),
                content=str(chapter_data.get("content", "")),
                footnotes=list(chapter_data.get("footnotes", [])),
                status=str(chapter_data.get("status", "completed")),
                created_at=_parse_datetime(chapter_data.get("created_at")),
            )
            db.add(chapter)
            seeded_chapters += 1

        seeded_projects += 1

    await db.commit()
    return {
        "loaded": True,
        "projects": seeded_projects,
        "chapters": seeded_chapters,
        "skipped_processing": skipped_processing,
        "pruned_missing": prune_missing,
        "artifact_path": str(path),
    }
