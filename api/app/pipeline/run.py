"""Background job: run the whole pipeline for one resource."""
from __future__ import annotations

import logging
import traceback
from pathlib import Path

from sqlmodel import Session, select

from .. import config
from ..db import engine
from ..models import Diagram, DiagramContentRow, Resource, now
from .extract import extract_image, extract_pdf
from .interpret import interpret
from .validate import validate

log = logging.getLogger(__name__)


def _step(session: Session, res: Resource, step: str) -> None:
    res.progress_step = step
    res.updated_at = now()
    session.add(res)
    session.commit()


def process_resource(resource_id: int, force_demo: bool = False) -> None:
    with Session(engine) as session:
        res = session.get(Resource, resource_id)
        if not res:
            return
        try:
            res.status, res.error = "processing", ""
            _step(session, res, "extracting")
            for d in session.exec(select(Diagram).where(Diagram.resource_id == res.id)).all():
                row = session.exec(select(DiagramContentRow).where(DiagramContentRow.diagram_id == d.id)).first()
                if row:
                    session.delete(row)
                session.delete(d)
            session.commit()

            src = Path(res.file_path)
            out_dir = config.STORAGE_DIR / f"resource-{res.id}" / "diagrams"
            ex = extract_pdf(src, out_dir) if src.suffix.lower() == ".pdf" else extract_image(src, out_dir)
            res.extracted_text = ex.full_text
            _step(session, res, "detecting")
            if not ex.diagrams:
                raise ValueError("No diagrams were found in this file. Upload a PDF with a figure, or an image file.")

            for found in ex.diagrams:
                diagram = Diagram(resource_id=res.id, page=found.page, image_path=str(found.image_path),
                                  caption=found.caption, page_text=found.page_text, found_labels=found.labels)
                session.add(diagram)
                session.commit()
                session.refresh(diagram)

                _step(session, res, "interpreting")
                content = interpret(found.image_path, labels=found.labels, page_text=ex.full_text,
                                    caption=found.caption, subject=res.subject, topic=res.topic, title=res.title,
                                    force_demo=force_demo)
                _step(session, res, "validating")
                content = validate(content, found.labels, ex.full_text)
                session.add(DiagramContentRow(diagram_id=diagram.id, content=content.model_dump()))
                session.commit()

            res.status = "needs_review"
            _step(session, res, "done")
        except Exception as e:  # surface every failure to the teacher
            log.error("processing failed: %s", traceback.format_exc())
            res.status, res.error = "failed", str(e) or e.__class__.__name__
            _step(session, res, "failed")
