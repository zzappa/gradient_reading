"""Assessment chat session logic."""
import re
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from assessment_scale import cefr_to_internal, internal_to_cefr
from models.assessment import AssessmentSession
from models.user import User
from services.claude import chat_message
from prompts.assessment import build_assessment_prompt, build_conclude_prompt

logger = logging.getLogger(__name__)

ASSESSMENT_START_MESSAGE = "Please assess my current language level."
CEFR_ASSESSMENT_PATTERN = re.compile(r"\[ASSESSMENT:\s*cefr=(A1|A2|B1|B2|C1|C2)\]", re.IGNORECASE)
LEGACY_ASSESSMENT_PATTERN = re.compile(r"\[ASSESSMENT:\s*level=(\d)\]")
ASSESSMENT_TAG_CLEAN_PATTERN = re.compile(r"\s*\[ASSESSMENT:\s*(?:cefr=(?:A1|A2|B1|B2|C1|C2)|level=\d)\]\s*$", re.IGNORECASE)
MAX_EXCHANGES = 10


def _extract_assessment(response_text: str) -> tuple[str, int | None, str | None]:
    """Return (clean_response, internal_level, cefr) from model output."""
    cefr_match = CEFR_ASSESSMENT_PATTERN.search(response_text)
    legacy_match = LEGACY_ASSESSMENT_PATTERN.search(response_text)

    internal_level = None
    cefr = None
    if cefr_match:
        cefr = cefr_match.group(1).upper()
        internal_level = cefr_to_internal(cefr)
    elif legacy_match:
        internal_level = int(legacy_match.group(1))
        internal_level = max(0, min(7, internal_level))
        cefr = internal_to_cefr(internal_level)

    clean_text = ASSESSMENT_TAG_CLEAN_PATTERN.sub("", response_text).strip()
    return clean_text, internal_level, cefr


async def start_session(user_id: str, target_language: str, db: AsyncSession) -> tuple[str, str]:
    """Start a new assessment session.

    Returns (session_id, first_message_from_claude).
    """
    system_prompt = build_assessment_prompt(target_language)
    messages = [{"role": "user", "content": ASSESSMENT_START_MESSAGE}]
    response_text = await chat_message(system_prompt, messages)
    clean_response, _, _ = _extract_assessment(response_text)

    session = AssessmentSession(
        user_id=user_id,
        target_language=target_language,
        messages=[
            {"role": "user", "content": ASSESSMENT_START_MESSAGE},
            {"role": "assistant", "content": clean_response},
        ],
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return session.id, clean_response


async def send_message(
    session_id: str, user_message: str, db: AsyncSession
) -> dict:
    """Process a user message in an assessment session.

    Returns dict with keys: response, completed, level, cefr.
    """
    session = await db.get(AssessmentSession, session_id)
    if not session:
        raise LookupError("Assessment session not found")

    if session.completed:
        return {
            "response": "This assessment is already completed.",
            "completed": True,
            "level": session.result_level,
            "cefr": internal_to_cefr(session.result_level),
        }

    system_prompt = build_assessment_prompt(session.target_language)

    # Build message history
    history = list(session.messages or [])
    history.append({"role": "user", "content": user_message})

    # If too many exchanges, ask Claude to conclude
    user_turns = sum(1 for m in history if m["role"] == "user")
    if user_turns >= MAX_EXCHANGES:
        conclude = build_conclude_prompt(session.target_language)
        history.append({"role": "user", "content": conclude})

    response_text = await chat_message(system_prompt, history)
    clean_response, level, cefr = _extract_assessment(response_text)

    # Update session messages (without the injected conclude prompt)
    updated_messages = list(session.messages or [])
    updated_messages.append({"role": "user", "content": user_message})
    updated_messages.append({"role": "assistant", "content": clean_response})
    session.messages = updated_messages

    completed = False
    if level is not None:
        session.completed = True
        session.result_level = level

        # Update user's level for this language
        user = await db.get(User, session.user_id)
        if user:
            levels = dict(user.levels or {})
            levels[session.target_language] = level
            user.levels = levels

        completed = True

    await db.commit()

    return {"response": clean_response, "completed": completed, "level": level, "cefr": cefr}
