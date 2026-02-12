from datetime import datetime
from pydantic import BaseModel, computed_field

from assessment_scale import internal_to_cefr


class AssessmentStart(BaseModel):
    user_id: str
    target_language: str = "es"


class AssessmentMessage(BaseModel):
    message: str


class AssessmentResponse(BaseModel):
    response: str
    completed: bool
    level: int | None = None
    cefr: str | None = None


class AssessmentRead(BaseModel):
    id: str
    user_id: str
    target_language: str
    messages: list
    result_level: int | None
    completed: bool
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def result_cefr(self) -> str | None:
        return internal_to_cefr(self.result_level)

    model_config = {"from_attributes": True}
