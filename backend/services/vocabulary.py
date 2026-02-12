"""VocabularyTracker — tracks introduced target-language terms across levels of a project."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


@dataclass
class VocabEntry:
    spanish: str  # kept as "spanish" for backward compat; actually "target term"
    english: str
    explanation: str
    first_chapter: int
    first_paragraph: int
    category: str
    grammar_note: str = ""
    pronunciation: str = ""
    native_script: str = ""


class VocabularyTracker:
    """Tracks which target-language terms have been introduced in a project.

    Ensures footnotes only appear on first occurrence.
    Serializable to/from JSON for storage in Project.vocabulary.
    """

    def __init__(self, terms: dict[str, dict] | None = None):
        self.terms: dict[str, VocabEntry] = {}
        if terms:
            for key, val in terms.items():
                # Handle missing grammar_note from old data
                for field in ("grammar_note", "pronunciation", "native_script"):
                    if field not in val:
                        val[field] = ""
                self.terms[key] = VocabEntry(**val)

    def add_terms(self, new_terms: list[dict], chapter_num: int, paragraph_offset: int = 0):
        """Add newly introduced terms from a transformation result."""
        for t in new_terms:
            term_key = t.get("term", "").lower().strip()
            if not term_key or term_key in self.terms:
                continue
            self.terms[term_key] = VocabEntry(
                spanish=t.get("term", ""),
                english=t.get("translation", ""),
                explanation=t.get("explanation", ""),
                first_chapter=chapter_num,
                first_paragraph=paragraph_offset,
                category=t.get("category", ""),
                grammar_note=t.get("grammar_note", ""),
                pronunciation=t.get("pronunciation", ""),
                native_script=t.get("native_script", ""),
            )

    def is_known(self, term: str) -> bool:
        return term.lower().strip() in self.terms

    def format_known_terms(self) -> str:
        """Format known terms for inclusion in the transformation prompt."""
        if not self.terms:
            return "(none yet)"
        lines = []
        for entry in self.terms.values():
            lines.append(f"- {entry.spanish} = {entry.english} ({entry.category})")
        return "\n".join(lines)

    def to_dict(self) -> dict[str, Any]:
        return {key: asdict(entry) for key, entry in self.terms.items()}

    @classmethod
    def from_dict(cls, data: dict | None) -> VocabularyTracker:
        if not data:
            return cls()
        return cls(terms=data)
