"""Demo accounts and one pre-published lesson so the student journey works immediately."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

from sqlmodel import Session, select

from . import config
from .auth import hash_password
from .db import engine
from .models import DiagramContentRow, Diagram, Resource, ReviewRecord, User, now
from .pipeline.run import process_resource
from .schemas import DiagramContent

log = logging.getLogger(__name__)
SAMPLE = Path(__file__).resolve().parents[2] / "samples" / "heart-lecture.pdf"
DEMO_PASSWORD = "demo1234"


def _user(session: Session, name: str, email: str, role: str) -> User:
    u = session.exec(select(User).where(User.email == email)).first()
    if not u:
        u = User(name=name, email=email, password_hash=hash_password(DEMO_PASSWORD), role=role,
                 institution="Demo University")
        session.add(u)
        session.commit()
        session.refresh(u)
    return u


def seed() -> None:
    with Session(engine) as session:
        teacher = _user(session, "Dr. Amaka Obi", "teacher@demo.school", "teacher")
        _user(session, "Tunde Bello", "student@demo.school", "student")
        if session.exec(select(Resource)).first() or not SAMPLE.exists():
            return
        res = Resource(owner_id=teacher.id, title="The Human Heart", subject="Human Anatomy",
                       topic="Cardiovascular System", audience="Undergraduate", filename=SAMPLE.name,
                       mime_type="application/pdf")
        session.add(res)
        session.commit()
        session.refresh(res)
        folder = config.STORAGE_DIR / f"resource-{res.id}"
        folder.mkdir(parents=True, exist_ok=True)
        target = folder / "original.pdf"
        shutil.copy(SAMPLE, target)
        res.file_path = str(target)
        session.add(res)
        session.commit()
        rid = res.id

    log.info("seeding sample lesson from %s", SAMPLE)
    process_resource(rid, force_demo=True)  # seeded lesson always uses the checked demo content

    with Session(engine) as session:
        res = session.get(Resource, rid)
        if res.status != "needs_review":
            return
        for d in session.exec(select(Diagram).where(Diagram.resource_id == rid)).all():
            row = session.exec(select(DiagramContentRow).where(DiagramContentRow.diagram_id == d.id)).first()
            content = DiagramContent.model_validate(row.content)
            for s in content.structures:
                s.reviewed = True
            for q in content.quiz:
                q.reviewed = True
            row.content = content.model_dump()
            session.add(row)
        res.status, res.published_at = "published", now()
        session.add(res)
        for action in ("approve", "publish"):
            session.add(ReviewRecord(resource_id=rid, teacher_id=res.owner_id, action=action, note="Seeded demo lesson"))
        session.commit()
