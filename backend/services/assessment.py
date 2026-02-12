"""Assessment chat session logic."""
import re
import logging

from sqlalchemy.ext.asyncio import AsyncSession

from models.assessment import AssessmentSession
from models.user import User
from services.claude import chat_message
from prompts.assessment import build_assessment_prompt, build_conclude_prompt

logger = logging.getLogger(__name__)

ASSESSMENT_PATTERN = re.compile(r"\[ASSESSMENT:\s*level=(\d)\]")
MAX_EXCHANGES = 10


async def start_session(user_id: str, target_language: str, db: AsyncSession) -> tuple[str, str]:
    """Start a new assessment session.

    Returns (session_id, first_message_from_claude).
    """
    system_prompt = build_assessment_prompt(target_language)
    messages = [{"role": "user", "content": "Hi! I'd like to find out my level."}]
    response_text = await chat_message(system_prompt, messages)

    session = AssessmentSession(
        user_id=user_id,
        target_language=target_language,
        messages=[
            {"role": "user", "content": "Hi! I'd like to find out my level."},
            {"role": "assistant", "content": response_text},
        ],
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return session.id, response_text


async def send_message(
    session_id: str, user_message: str, db: AsyncSession
) -> dict:
    """Process a user message in an assessment session.

    Returns dict with keys: response, completed, level.
    """
    session = await db.get(AssessmentSession, session_id)
    if not session:
        raise LookupError("Assessment session not found")

    if session.completed:
        return {
            "response": "This assessment is already completed.",
            "completed": True,
            "level": session.result_level,
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

    # Update session messages (without the injected conclude prompt)
    updated_messages = list(session.messages or [])
    updated_messages.append({"role": "user", "content": user_message})
    updated_messages.append({"role": "assistant", "content": response_text})
    session.messages = updated_messages

    # Check for assessment result
    match = ASSESSMENT_PATTERN.search(response_text)
    completed = False
    level = None

    if match:
        level = int(match.group(1))
        level = max(0, min(7, level))
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

    return {"response": response_text, "completed": completed, "level": level}
