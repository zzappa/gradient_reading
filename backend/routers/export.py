"""Export endpoints for PDF, Markdown, EPUB."""
import re
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.project import Project
from models.chapter import Chapter
from services.exporter import export_pdf, export_markdown, export_epub


def _safe_filename(title: str, ext: str) -> str:
    """Build an ASCII-safe filename from a project title."""
    name = re.sub(r'[^\w\s-]', '', title.replace(' ', '_'))
    name = re.sub(r'_+', '_', name).strip('_') or 'export'
    return f"{name}.{ext}"

router = APIRouter(prefix="/api/projects", tags=["export"])


async def _get_project_chapters(project_id: str, db: AsyncSession):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != "completed":
        raise HTTPException(status_code=400, detail="Project is not yet completed")

    result = await db.execute(
        select(Chapter)
        .where(Chapter.project_id == project_id, Chapter.status == "completed")
        .order_by(Chapter.chapter_num)
    )
    chapters = result.scalars().all()
    if not chapters:
        raise HTTPException(status_code=400, detail="No completed chapters found")

    return project, chapters


@router.get("/{project_id}/export/pdf")
async def export_project_pdf(project_id: str, db: AsyncSession = Depends(get_db)):
    project, chapters = await _get_project_chapters(project_id, db)
    pdf_bytes = export_pdf(project.title, chapters, project.start_level)
    filename = _safe_filename(project.title, "pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{project_id}/export/md")
async def export_project_md(project_id: str, db: AsyncSession = Depends(get_db)):
    project, chapters = await _get_project_chapters(project_id, db)
    md_text = export_markdown(project.title, chapters, project.start_level)
    filename = _safe_filename(project.title, "md")
    return Response(
        content=md_text.encode(),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{project_id}/export/epub")
async def export_project_epub(project_id: str, db: AsyncSession = Depends(get_db)):
    project, chapters = await _get_project_chapters(project_id, db)
    epub_bytes = export_epub(project.title, chapters, project.start_level)
    filename = _safe_filename(project.title, "epub")
    return Response(
        content=epub_bytes,
        media_type="application/epub+zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
