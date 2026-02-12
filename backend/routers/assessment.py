"""Assessment chat endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models.assessment import AssessmentSession
from models.user import User
from schemas.assessment import AssessmentStart, AssessmentMessage, AssessmentResponse, AssessmentRead
from services.assessment import start_session, send_message

router = APIRouter(prefix="/api/assessment", tags=["assessment"])


@router.get("/", response_model=list[AssessmentRead])
async def list_assessments(user_id: str = Query(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AssessmentSession)
        .filter_by(user_id=user_id)
        .order_by(AssessmentSession.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{session_id}", response_model=AssessmentRead)
async def get_assessment(session_id: str, db: AsyncSession = Depends(get_db)):
    session = await db.get(AssessmentSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Assessment session not found")
    return session


@router.post("/start")
async def start_assessment(data: AssessmentStart, db: AsyncSession = Depends(get_db)):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")
    user = await db.get(User, data.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    session_id, first_message = await start_session(data.user_id, data.target_language, db)
    return {"session_id": session_id, "message": first_message}


@router.post("/{session_id}/message", response_model=AssessmentResponse)
async def assessment_message(
    session_id: str,
    data: AssessmentMessage,
    db: AsyncSession = Depends(get_db),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")
    try:
        result = await send_message(session_id, data.message, db)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return AssessmentResponse(**result)
