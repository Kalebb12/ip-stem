"""Database tables (SQLModel). JSON columns hold the structured content."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(index=True, unique=True)
    password_hash: str
    role: str  # "teacher" | "student"
    institution: str = ""
    prefs: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now)


class AuthToken(SQLModel, table=True):
    token: str = Field(primary_key=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=now)


class Resource(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)
    title: str
    subject: str = ""
    topic: str = ""
    audience: str = ""
    filename: str = ""
    file_path: str = ""
    mime_type: str = ""
    # uploaded -> processing -> needs_review -> approved -> published  (or failed)
    status: str = "uploaded"
    progress_step: str = ""
    error: str = ""
    extracted_text: str = ""
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)
    published_at: Optional[datetime] = None


class Diagram(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    resource_id: int = Field(foreign_key="resource.id", index=True)
    page: int = 1
    image_path: str = ""
    caption: str = ""
    page_text: str = ""
    found_labels: list[str] = Field(default_factory=list, sa_column=Column(JSON))


class DiagramContentRow(SQLModel, table=True):
    __tablename__ = "diagram_content"
    id: Optional[int] = Field(default=None, primary_key=True)
    diagram_id: int = Field(foreign_key="diagram.id", index=True, unique=True)
    content: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    version: int = 1
    updated_at: datetime = Field(default_factory=now)


class ReviewRecord(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    resource_id: int = Field(foreign_key="resource.id", index=True)
    teacher_id: int = Field(foreign_key="user.id")
    action: str  # edit | approve | publish | withdraw | reprocess
    note: str = ""
    created_at: datetime = Field(default_factory=now)


class ChatMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    resource_id: int = Field(foreign_key="resource.id", index=True)
    student_id: int = Field(foreign_key="user.id", index=True)
    role: str  # student | companion
    text: str
    grounding: str = ""
    cited_structure_ids: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=now)


class LearningProgress(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    resource_id: int = Field(foreign_key="resource.id", index=True)
    student_id: int = Field(foreign_key="user.id", index=True)
    structures_viewed: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    steps_completed: int = 0
    best_score: Optional[int] = None
    quiz_total: Optional[int] = None
    last_opened_at: datetime = Field(default_factory=now)
