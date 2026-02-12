"""Transformation and job status endpoints."""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db, async_session
from models.chapter import Chapter
from models.project import Project
from models.job import TransformationJob
from schemas.job import JobRead
from services.transformer import run_transformation_guarded

router = APIRouter(tags=["transform"])


@router.post("/api/projects/{project_id}/transform")
async def start_transformation(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY is not configured",
        )
    if project.status == "processing":
        raise HTTPException(status_code=400, detail="Project is already being processed")

    running = await db.execute(
        select(TransformationJob.id).where(
            TransformationJob.project_id == project_id,
            TransformationJob.status.in_(["running", "processing"]),
        ).limit(1)
    )
    if running.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Project is already being processed")

    # Restart policy: clear previous transformation artifacts for a clean rerun.
    await db.execute(delete(Chapter).where(Chapter.project_id == project_id))
    await db.execute(delete(TransformationJob).where(TransformationJob.project_id == project_id))
    project.vocabulary = {}

    job = TransformationJob(project_id=project_id)
    db.add(job)
    project.status = "processing"
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(run_transformation_guarded, project_id, job.id, async_session)

    return {"job_id": job.id}


@router.get("/api/jobs/{job_id}", response_model=JobRead)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await db.get(TransformationJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobRead.model_validate(job)


@router.get("/api/projects/{project_id}/job", response_model=JobRead)
async def get_project_job(project_id: str, db: AsyncSession = Depends(get_db)):
    """Get the latest job for a project (used when jobId is lost from navigation state)."""
    result = await db.execute(
        select(TransformationJob)
        .where(TransformationJob.project_id == project_id)
        .order_by(TransformationJob.started_at.desc())
        .limit(1)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="No job found for this project")
    return JobRead.model_validate(job)
