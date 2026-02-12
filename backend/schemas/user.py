from datetime import datetime
from pydantic import BaseModel, Field, field_validator


class UserRead(BaseModel):
    id: str
    name: str
    levels: dict = Field(default_factory=dict)  # {"es": 3, "de": 0}
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = None
    levels: dict[str, int] | None = None

    @field_validator("levels")
    @classmethod
    def validate_levels(cls, value: dict[str, int] | None):
        if value is None:
            return value
        for lang, level in value.items():
            if not 0 <= level <= 7:
                raise ValueError(f"Level for {lang} must be between 0 and 7")
        return value


class UserList(BaseModel):
    users: list[UserRead]
