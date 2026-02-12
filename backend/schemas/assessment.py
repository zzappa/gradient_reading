from datetime import datetime
from pydantic import BaseModel


class AssessmentStart(BaseModel):
    user_id: str
    target_language: str = "es"


class AssessmentMessage(BaseModel):
    message: str


class AssessmentResponse(BaseModel):
    response: str
    completed: bool
    level: int | None = None


class AssessmentRead(BaseModel):
    id: str
    user_id: str
    target_language: str
    messages: list
    result_level: int | None
    completed: bool
    created_at: datetime

    model_config = {"from_attributes": True}
