"""Step 6: deterministic quality and uncertainty checks. No AI involved.

Adds human-readable flags. A resource cannot be published while any flagged
item is still unreviewed by the teacher.
"""
from __future__ import annotations

import re

from ..schemas import DiagramContent


def _norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


def validate(content: DiagramContent, found_labels: list[str], lecture_text: str) -> DiagramContent:
    ids = {s.id for s in content.structures}
    labels = {_norm(l) for l in (found_labels or content.visible_labels)}
    lecture = _norm(lecture_text)

    for s in content.structures:
        flags: list[str] = []
        name = _norm(s.name)
        if s.evidence == "labelled" and labels and not any(name in l or l in name for l in labels if l):
            flags.append("Marked as labelled, but no matching label text was found in the diagram.")
        if s.evidence == "inferred_from_text":
            flags.append("Not visible in the diagram. This comes from the lecture text, so confirm it belongs in this lesson.")
        if s.confidence == "low":
            flags.append("The AI is not confident about this identification.")
        if lecture and name and name not in lecture and _norm(s.name.split()[0]) not in lecture:
            flags.append("This structure is not mentioned in the lecture notes.")
        bad = [r for r in s.adjacent_to + [c.to for c in s.connections] if r not in ids]
        if bad:
            flags.append(f"Refers to unknown structures: {', '.join(sorted(set(bad)))}.")
            s.adjacent_to = [r for r in s.adjacent_to if r in ids]
            s.connections = [c for c in s.connections if c.to in ids]
        if not s.location.strip() or not s.function.strip():
            flags.append("Location or function is missing.")
        s.flags = flags

    for p in content.processes:
        for step in p.steps:
            step.structure_ids = [i for i in step.structure_ids if i in ids]

    for q in content.quiz:
        flags = []
        if not (0 <= q.answer < len(q.options)):
            flags.append("The marked answer does not match any option.")
            q.answer = 0
        if len(q.options) < 2:
            flags.append("A question needs at least two options.")
        missing = [i for i in q.structure_ids if i not in ids]
        if missing:
            flags.append("Refers to a structure that is not in this lesson.")
            q.structure_ids = [i for i in q.structure_ids if i in ids]
        q.flags = flags
    return content


def unresolved_flags(content: DiagramContent) -> int:
    return sum(1 for s in content.structures if s.flags and not s.reviewed) + sum(
        1 for q in content.quiz if q.flags and not q.reviewed
    )
