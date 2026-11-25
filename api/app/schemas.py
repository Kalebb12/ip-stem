"""The structured accessible-content schema.

This is the contract between the AI pipeline, the teacher review editor and the
student explorer. Every diagram is stored as one DiagramContent document.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Evidence = Literal["labelled", "visible_unlabelled", "inferred_from_text"]
Confidence = Literal["high", "medium", "low"]


class Connection(BaseModel):
    to: str = Field(description="id of the structure blood/flow moves to or from")
    via: Optional[str] = Field(default=None, description="valve or vessel it passes through")
    direction: Literal["in", "out"] = "out"


class Structure(BaseModel):
    id: str
    name: str
    evidence: Evidence = "labelled"
    confidence: Confidence = "medium"
    location: str = ""
    function: str = ""
    adjacent_to: list[str] = Field(default_factory=list)
    connections: list[Connection] = Field(default_factory=list)
    source_quote: Optional[str] = None
    # normalised [x, y, w, h] in 0..1 image space, used to highlight for low-vision users
    bbox: Optional[list[float]] = None
    flags: list[str] = Field(default_factory=list)
    reviewed: bool = False


class ProcessStep(BaseModel):
    text: str
    structure_ids: list[str] = Field(default_factory=list)


class Process(BaseModel):
    id: str
    name: str
    steps: list[ProcessStep] = Field(default_factory=list)


class QuizItem(BaseModel):
    id: str
    question: str
    options: list[str]
    answer: int
    explanation: str = ""
    structure_ids: list[str] = Field(default_factory=list)
    flags: list[str] = Field(default_factory=list)
    reviewed: bool = False


class DiagramContent(BaseModel):
    title: str = ""
    overview: str = ""
    orientation_note: str = ""
    visible_labels: list[str] = Field(default_factory=list)
    structures: list[Structure] = Field(default_factory=list)
    processes: list[Process] = Field(default_factory=list)
    quiz: list[QuizItem] = Field(default_factory=list)
    generated_by: str = "demo-fixture"
    # why live AI was not used, shown to the teacher (empty when AI ran)
    ai_note: str = ""
