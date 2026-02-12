"""Claude API wrapper using tool use for structured transformation output."""
import logging

import anthropic

from config import settings

logger = logging.getLogger(__name__)

TRANSFORM_TOOL = {
    "name": "submit_transformation",
    "description": "Submit the transformed text and any new target-language terms introduced.",
    "input_schema": {
        "type": "object",
        "properties": {
            "paragraphs": {
                "type": "array",
                "description": "The transformed paragraphs, in the same order as the input.",
                "items": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": (
                                "The transformed paragraph text. "
                                "For Latin-script targets: wrap each NEW target-language content word "
                                "with {{display_text|base_form}}. "
                                "For non-Latin targets: wrap EVERY target-language token with "
                                "{{display_text|base_form|native_display}} where native_display is "
                                "the word in native script as it appears in context (inflected form). "
                                "Example (Latin): 'El {{gato|gato}} se {{sentó|sentar}} en la {{alfombra|alfombra}}.' "
                                "Example (non-Latin): '{{yego|on|его}} {{dom|dom|дом}} {{byl|byt|был}} krasivym.' "
                                "Do NOT wrap source-language words or proper nouns."
                            ),
                        },
                        "footnote_refs": {
                            "type": "array",
                            "description": "Base forms of NEW target-language terms in this paragraph (first occurrence only).",
                            "items": {"type": "string"},
                        },
                    },
                    "required": ["text", "footnote_refs"],
                },
            },
            "new_terms": {
                "type": "array",
                "description": (
                    "REQUIRED: Every term in any paragraph's footnote_refs MUST have a "
                    "matching entry here with ALL fields filled. Missing entries = broken footnotes."
                ),
                "items": {
                    "type": "object",
                    "properties": {
                        "term": {
                            "type": "string",
                            "description": "The target-language term (base/dictionary form). MUST match footnote_refs.",
                        },
                        "translation": {
                            "type": "string",
                            "description": "The source-language translation.",
                        },
                        "explanation": {
                            "type": "string",
                            "description": "Brief explanation of the term (usage, context).",
                        },
                        "category": {
                            "type": "string",
                            "description": "Category: article, preposition, connector, verb, noun, adjective, adverb, pronoun, other.",
                        },
                        "grammar_note": {
                            "type": "string",
                            "description": "One-sentence grammar explanation.",
                        },
                        "pronunciation": {
                            "type": "string",
                            "description": "IPA transcription of the term (e.g. '/ˈɡa.to/' for 'gato', '/pʲɪˈvʲet/' for 'privet'). Use standard IPA symbols. Include stress marks.",
                        },
                        "native_script": {
                            "type": "string",
                            "description": (
                                "For transliterated terms: the original native script form "
                                "(e.g. 'дом' for 'dom', '猫' for 'neko', 'כלב' for 'kelev'). "
                                "Empty string if language uses Latin alphabet."
                            ),
                        },
                    },
                    "required": ["term", "translation", "explanation", "category", "grammar_note", "pronunciation", "native_script"],
                },
            },
        },
        "required": ["paragraphs", "new_terms"],
    },
}


def _get_client() -> anthropic.AsyncAnthropic:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def transform_chunk(system_prompt: str, chunk_text: str, level: int = 1, retries: int = 1) -> dict | None:
    """Call Claude to transform a chunk of text.

    Single-pass: transforms directly from source text to the target level.
    Returns the tool input dict with 'paragraphs' and 'new_terms', or None on failure.
    """
    user_message = f"""Transform the following text to Level {level}/7. Use the submit_transformation tool to return your result.

SOURCE TEXT:
\"\"\"
{chunk_text}
\"\"\""""

    for attempt in range(1 + retries):
        try:
            client = _get_client()
            response = await client.messages.create(
                model="claude-opus-4-6",
                max_tokens=16384,
                system=system_prompt,
                tools=[TRANSFORM_TOOL],
                tool_choice={"type": "tool", "name": "submit_transformation"},
                messages=[{"role": "user", "content": user_message}],
            )

            for block in response.content:
                if block.type == "tool_use" and block.name == "submit_transformation":
                    return block.input

            logger.warning("No tool use block in transform response (attempt %d)", attempt)

        except Exception as e:
            logger.error("Claude transform API error (attempt %d): %s", attempt, e)
            if attempt < retries:
                continue
            return None

    return None


COMPREHENSION_TOOL = {
    "name": "submit_questions",
    "description": "Submit comprehension questions about the text.",
    "input_schema": {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {"type": "string"},
                "description": "4 comprehension questions about the text.",
            },
        },
        "required": ["questions"],
    },
}

EVALUATION_TOOL = {
    "name": "submit_evaluation",
    "description": "Submit the evaluation of a student's answer.",
    "input_schema": {
        "type": "object",
        "properties": {
            "correct": {
                "type": "boolean",
                "description": "Whether the answer is substantially correct.",
            },
            "feedback": {
                "type": "string",
                "description": "Brief feedback explaining why the answer is correct or what was missed.",
            },
        },
        "required": ["correct", "feedback"],
    },
}


async def generate_comprehension(system_prompt: str, text: str) -> list[str] | None:
    """Generate comprehension questions for a text passage."""
    try:
        client = _get_client()
        response = await client.messages.create(
            model="claude-opus-4-6",
            max_tokens=2048,
            system=system_prompt,
            tools=[COMPREHENSION_TOOL],
            tool_choice={"type": "tool", "name": "submit_questions"},
            messages=[{"role": "user", "content": f"Generate comprehension questions for this text:\n\n{text}"}],
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == "submit_questions":
                return block.input.get("questions", [])

    except Exception as e:
        logger.error("Claude comprehension generation error: %s", e)

    return None


async def evaluate_answer(system_prompt: str, question: str, answer: str) -> dict | None:
    """Evaluate a student's answer to a comprehension question."""
    try:
        client = _get_client()
        response = await client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            system=system_prompt,
            tools=[EVALUATION_TOOL],
            tool_choice={"type": "tool", "name": "submit_evaluation"},
            messages=[{
                "role": "user",
                "content": f"Question: {question}\n\nStudent's answer: {answer}",
            }],
        )

        for block in response.content:
            if block.type == "tool_use" and block.name == "submit_evaluation":
                return block.input

    except Exception as e:
        logger.error("Claude evaluation error: %s", e)

    return None


async def chat_message(system_prompt: str, messages: list[dict]) -> str:
    """Send a chat message to Claude and return the text response.

    Used for assessment conversations.
    """
    try:
        client = _get_client()
        response = await client.messages.create(
            model="claude-opus-4-6",
            max_tokens=1024,
            system=system_prompt,
            messages=messages,
        )
        return response.content[0].text
    except Exception as e:
        logger.error("Claude chat error: %s", e)
        return "I'm sorry, I encountered an error. Please try again."
