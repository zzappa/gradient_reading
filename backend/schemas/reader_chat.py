from pydantic import BaseModel, Field


class ReaderChatMessage(BaseModel):
    message: str
    level: int = 0
    context_paragraph: str | None = None
    history: list[dict] = Field(default_factory=list)
    user_cefr: str | None = None
