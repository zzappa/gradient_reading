"""Text splitting utilities."""
import re


def split_into_paragraphs(text: str) -> list[str]:
    """Split text on double newlines, stripping whitespace, removing empty paragraphs."""
    paragraphs = re.split(r"\n\s*\n", text.strip())
    return [p.strip() for p in paragraphs if p.strip()]
