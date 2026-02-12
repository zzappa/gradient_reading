"""Reader chat endpoint — ask questions about the text while reading."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models.project import Project
from schemas.reader_chat import ReaderChatMessage
from services.vocabulary import VocabularyTracker
from services.claude import chat_message
from languages import get_language, get_source_language_name

router = APIRouter(prefix="/api/projects", tags=["reader-chat"])


def _build_reader_chat_prompt(project: Project, level: int, context_paragraph: str | None) -> str:
    lang = get_language(project.target_language)
    lang_name = lang["name"]
    source_name = get_source_language_name(getattr(project, "source_language", "en"))

    vocab_tracker = VocabularyTracker.from_dict(project.vocabulary)
    known = vocab_tracker.format_known_terms()

    prompt = f"""You are a friendly language learning assistant for the Gradient Immersion method.
The user is reading a text being transformed from {source_name} to {lang_name}.
They are currently at Level {level} of 7.

Known vocabulary at this point:
{known}

Help them understand grammar, vocabulary, pronunciation, and cultural context.
Keep answers concise and practical — 2-4 short paragraphs max.
Use examples from the text when possible.
Format responses in markdown. Use bold for {lang_name} terms."""

    if context_paragraph:
        prompt += f"""

The paragraph they are currently looking at:
\"\"\"{context_paragraph}\"\"\""""

    return prompt


@router.post("/{project_id}/chat/message")
async def reader_chat(
    project_id: str,
    data: ReaderChatMessage,
    db: AsyncSession = Depends(get_db),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY is not configured")
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    system_prompt = _build_reader_chat_prompt(project, data.level, data.context_paragraph)

    # Build messages list from history + current message
    messages = []
    for msg in data.history:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": data.message})

    response_text = await chat_message(system_prompt, messages)
    return {"response": response_text}
