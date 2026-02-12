from datetime import datetime
from typing import Any
from pydantic import BaseModel


class ChapterRead(BaseModel):
    id: str
    project_id: str
    chapter_num: int
    level: int
    source_text: str
    content: str
    footnotes: list[Any]
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChapterList(BaseModel):
    chapters: list[ChapterRead]
