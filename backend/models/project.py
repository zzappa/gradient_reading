import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    target_language: Mapped[str] = mapped_column(String, nullable=False, default="es")
    source_language: Mapped[str] = mapped_column(String, nullable=False, default="en")
    source_text: Mapped[str] = mapped_column(Text, nullable=False)
    start_level: Mapped[int] = mapped_column(Integer, nullable=False)
    vocabulary: Mapped[dict | None] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String, default="created")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", back_populates="projects")
    chapters = relationship("Chapter", back_populates="project", cascade="all, delete-orphan")
    jobs = relationship("TransformationJob", back_populates="project", cascade="all, delete-orphan")
