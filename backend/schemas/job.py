from datetime import datetime
from pydantic import BaseModel


class JobRead(BaseModel):
    id: str
    project_id: str
    total_chapters: int
    completed_chapters: int
    current_chapter: int
    status: str
    error_message: str | None
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
