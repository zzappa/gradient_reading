#!/usr/bin/env python3
"""Generate preseed artifact for `samples/a-scandal-in-bohemia.md`.

This script runs full transformations for all configured target languages
(except the source language), writes the result to an artifact JSON, and keeps
project IDs deterministic so startup seeding can upsert cleanly.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import delete, select

from config import settings
from database import async_session, init_db
from languages import LANGUAGE_CODES, get_language
from models.chapter import Chapter
from models.job import TransformationJob
from models.project import Project
from models.user import User
from preseed_artifacts import (
    PRESEED_ARTIFACT_PATH,
    PRESEED_SOURCE_PATH,
    PRESEED_USER_ID,
    PRESEED_USER_NAME,
    build_preseed_project_id,
    build_preseed_project_title,
    empty_artifact,
    load_artifact,
    save_artifact,
)
from services.transformer import run_transformation

RETRYABLE_ERRORS = (
    "Project disappeared",
    "expected to update 1 row(s); 0 were matched",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate transformed A Scandal in Bohemia sample for all target languages "
            "and save as a reusable preseed artifact."
        )
    )
    parser.add_argument(
        "--source",
        default=str(PRESEED_SOURCE_PATH),
        help="Path to source markdown text (default: samples/a-scandal-in-bohemia.md).",
    )
    parser.add_argument(
        "--output",
        default=str(PRESEED_ARTIFACT_PATH),
        help="Artifact output JSON path.",
    )
    parser.add_argument(
        "--source-language",
        default="en",
        help="Source language code used for transformation.",
    )
    parser.add_argument(
        "--languages",
        default="",
        help="Comma-separated target language codes to generate. Default: all except source language.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Regenerate languages even if they already exist in artifact.",
    )
    return parser.parse_args()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _resolve_path(raw: str, cwd: Path) -> Path:
    candidate = Path(raw)
    if candidate.is_absolute():
        return candidate
    return (cwd / candidate).resolve()


def _target_languages(source_language: str, requested: str) -> list[str]:
    if requested.strip():
        langs = [code.strip() for code in requested.split(",") if code.strip()]
    else:
        langs = [code for code in LANGUAGE_CODES if code != source_language]

    invalid = [code for code in langs if code not in LANGUAGE_CODES]
    if invalid:
        raise ValueError(f"Unsupported language codes: {invalid}. Supported: {LANGUAGE_CODES}")

    langs = [code for code in langs if code != source_language]
    if not langs:
        raise ValueError("No target languages to process.")
    return langs


def _project_payload(project: Project, chapters: list[Chapter]) -> dict:
    return {
        "id": project.id,
        "title": project.title,
        "target_language": project.target_language,
        "source_language": project.source_language,
        "source_text": project.source_text,
        "start_level": project.start_level,
        "status": project.status,
        "created_at": project.created_at.isoformat() if project.created_at else _utc_now_iso(),
        "vocabulary": project.vocabulary or {},
        "chapters": [
            {
                "chapter_num": chapter.chapter_num,
                "level": chapter.level,
                "source_text": chapter.source_text,
                "content": chapter.content,
                "footnotes": chapter.footnotes or [],
                "status": chapter.status,
                "created_at": chapter.created_at.isoformat() if chapter.created_at else _utc_now_iso(),
            }
            for chapter in chapters
        ],
    }


async def _ensure_preseed_user() -> None:
    async with async_session() as db:
        user = await db.get(User, PRESEED_USER_ID)
        if user is None:
            db.add(User(id=PRESEED_USER_ID, name=PRESEED_USER_NAME, levels={}))
        else:
            user.name = PRESEED_USER_NAME
            if user.levels is None:
                user.levels = {}
        await db.commit()


async def _run_language(
    source_text: str,
    source_language: str,
    target_language: str,
) -> dict:
    project_id = build_preseed_project_id(target_language, source_language)
    title = build_preseed_project_title(target_language)
    job_id = str(uuid.uuid4())

    async with async_session() as db:
        project = await db.get(Project, project_id)
        if project is None:
            project = Project(
                id=project_id,
                user_id=PRESEED_USER_ID,
                title=title,
                target_language=target_language,
                source_language=source_language,
                source_text=source_text,
                start_level=0,
                vocabulary={},
                status="created",
            )
            db.add(project)
        else:
            project.user_id = PRESEED_USER_ID
            project.title = title
            project.target_language = target_language
            project.source_language = source_language
            project.source_text = source_text
            project.start_level = 0
            project.vocabulary = {}
            project.status = "created"

        await db.flush()
        await db.execute(delete(Chapter).where(Chapter.project_id == project_id))
        await db.execute(delete(TransformationJob).where(TransformationJob.project_id == project_id))
        db.add(TransformationJob(id=job_id, project_id=project_id, status="running"))
        await db.commit()

    await run_transformation(project_id, job_id, async_session)

    async with async_session() as db:
        project = await db.get(Project, project_id)
        job = await db.get(TransformationJob, job_id)
        if project is None:
            raise RuntimeError(f"Project disappeared for language {target_language}.")

        if project.status != "completed":
            reason = job.error_message if job and job.error_message else "unknown error"
            raise RuntimeError(f"Transformation failed for {target_language}: {reason}")

        result = await db.execute(
            select(Chapter)
            .where(Chapter.project_id == project_id)
            .order_by(Chapter.chapter_num)
        )
        chapters = result.scalars().all()
        if len(chapters) != 8:
            raise RuntimeError(
                f"Expected 8 chapters for {target_language}, found {len(chapters)}."
            )

        return _project_payload(project, chapters)


async def _run_language_with_retry(
    source_text: str,
    source_language: str,
    target_language: str,
    retries: int = 1,
) -> dict:
    last_error: RuntimeError | None = None
    for attempt in range(retries + 1):
        try:
            return await _run_language(source_text, source_language, target_language)
        except RuntimeError as exc:
            last_error = exc
            message = str(exc)
            retryable = any(marker in message for marker in RETRYABLE_ERRORS)
            if (not retryable) or attempt >= retries:
                raise
            print(
                f"Retrying {target_language} after transient race "
                f"({attempt + 1}/{retries + 1}): {message}",
                flush=True,
            )
            await asyncio.sleep(1.0)

    # Defensive fallback (loop always returns or raises above).
    assert last_error is not None
    raise last_error


async def main_async(args: argparse.Namespace) -> None:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is required to generate transformations.")

    cwd = Path.cwd()
    source_path = _resolve_path(args.source, cwd)
    output_path = _resolve_path(args.output, cwd)
    source_language = args.source_language.strip().lower()
    target_languages = _target_languages(source_language, args.languages)

    if not source_path.exists():
        raise FileNotFoundError(f"Source sample not found: {source_path}")
    source_text = source_path.read_text(encoding="utf-8").strip()
    if not source_text:
        raise RuntimeError(f"Source sample is empty: {source_path}")

    print(f"Source: {source_path}", flush=True)
    print(f"Output: {output_path}", flush=True)
    print(
        f"Source language: {source_language} | Target languages: {', '.join(target_languages)}",
        flush=True,
    )
    print("Initializing database...", flush=True)
    await init_db()
    print("Ensuring preseed user exists...", flush=True)
    await _ensure_preseed_user()

    artifact = load_artifact(output_path)
    if artifact is None:
        artifact = empty_artifact(source_text=source_text, source_path=source_path)
    else:
        artifact["source_text"] = source_text
    artifact["source_language"] = source_language
    artifact["source_path"] = str(source_path)

    projects_by_lang = {}
    for project in artifact.get("projects", []):
        if isinstance(project, dict):
            lang = str(project.get("target_language", "")).strip()
            if lang:
                projects_by_lang[lang] = project

    for lang in target_languages:
        lang_name = get_language(lang)["name"]
        if (not args.force) and (lang in projects_by_lang):
            print(f"Skipping {lang} ({lang_name}) - already in artifact")
            continue

        print(f"Generating {lang} ({lang_name})...")
        payload = await _run_language_with_retry(source_text, source_language, lang, retries=1)
        projects_by_lang[lang] = payload
        artifact["projects"] = [projects_by_lang[k] for k in sorted(projects_by_lang)]
        artifact["generated_at"] = _utc_now_iso()
        save_artifact(artifact, output_path)
        print(f"Saved artifact snapshot after {lang}.")

    print(f"Done. Artifact written to {output_path}")


def main() -> None:
    args = parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
