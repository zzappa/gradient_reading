from pydantic import BaseModel


class GenerateRequest(BaseModel):
    level: int


class GenerateResponse(BaseModel):
    questions: list[str]


class EvaluateRequest(BaseModel):
    question: str
    answer: str
    level: int


class EvaluateResponse(BaseModel):
    correct: bool
    feedback: str
