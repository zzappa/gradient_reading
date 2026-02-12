from datetime import datetime
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    title: str
    source_text: str
    user_id: str
    target_language: str = "es"
    source_language: str = "en"


class ProjectRead(BaseModel):
    id: str
    user_id: str
    title: str
    target_language: str
    source_language: str
    source_text: str
    start_level: int
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProjectList(BaseModel):
    projects: list[ProjectRead]
