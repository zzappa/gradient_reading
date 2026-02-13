from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.user import User
from models.project import Project
from models.chapter import Chapter
from schemas.project import ProjectCreate, ProjectRead, ProjectList
from schemas.chapter import ChapterRead, ChapterList
from transformation_artifacts import save_project_snapshot

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=ProjectList)
async def list_projects(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.user_id == user_id).order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return ProjectList(projects=[ProjectRead.model_validate(p) for p in projects])


@router.post("", response_model=ProjectRead, status_code=201)
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if data.source_language == data.target_language:
        raise HTTPException(status_code=400, detail="Source and target language cannot be the same")
    lang = data.target_language
    levels = user.levels or {}
    start_level = levels.get(lang, 0)

    project = Project(
        title=data.title,
        source_text=data.source_text,
        user_id=data.user_id,
        target_language=lang,
        source_language=data.source_language,
        start_level=start_level,
    )
    db.add(project)
    await db.flush()
    await save_project_snapshot(db, project, include_chapters=False)
    await db.commit()
    await db.refresh(project)
    return ProjectRead.model_validate(project)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectRead.model_validate(project)


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.delete(project)
    await db.commit()


@router.get("/{project_id}/chapters", response_model=ChapterList)
async def list_chapters(project_id: str, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    result = await db.execute(
        select(Chapter).where(Chapter.project_id == project_id).order_by(Chapter.chapter_num)
    )
    chapters = result.scalars().all()
    return ChapterList(chapters=[ChapterRead.model_validate(c) for c in chapters])


@router.get("/{project_id}/chapters/{chapter_num}", response_model=ChapterRead)
async def get_chapter(project_id: str, chapter_num: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Chapter).where(
            Chapter.project_id == project_id,
            Chapter.chapter_num == chapter_num,
        ).order_by(Chapter.created_at.desc()).limit(1)
    )
    chapter = result.scalar_one_or_none()
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return ChapterRead.model_validate(chapter)
