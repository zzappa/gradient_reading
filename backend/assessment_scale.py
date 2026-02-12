"""CEFR <-> internal level mappings for assessment compatibility."""

CEFR_LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")

# Internal 0-7 gradient levels used by existing project/user models.
# CEFR results are mapped to this scale for backward compatibility.
CEFR_TO_INTERNAL = {
    "A1": 1,
    "A2": 2,
    "B1": 3,
    "B2": 4,
    "C1": 5,
    "C2": 6,
}

# Legacy/seeded internal levels -> CEFR buckets.
INTERNAL_TO_CEFR = {
    0: "A1",
    1: "A1",
    2: "A2",
    3: "B1",
    4: "B2",
    5: "C1",
    6: "C2",
    7: "C2",
}


def normalize_cefr(value: str | None) -> str | None:
    if not value:
        return None
    upper = value.strip().upper()
    if upper in CEFR_TO_INTERNAL:
        return upper
    return None


def cefr_to_internal(value: str | None) -> int | None:
    normalized = normalize_cefr(value)
    if not normalized:
        return None
    return CEFR_TO_INTERNAL[normalized]


def internal_to_cefr(level: int | None) -> str | None:
    if level is None:
        return None
    return INTERNAL_TO_CEFR.get(int(level))
