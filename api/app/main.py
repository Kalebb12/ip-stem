"""SenseAtlas API (FastAPI)."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path
from typing import Any, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from . import config
from .auth import (current_user, hash_password, issue_token, require_student, require_teacher,
                   verify_password)
from .db import get_session, init_db
from .models import (AuthToken, ChatMessage, Diagram, DiagramContentRow, LearningProgress, Resource,
                     ReviewRecord, User, now)
from . import tts, yarngpt
from .pipeline import qa
from .pipeline.run import process_resource
from .pipeline.validate import unresolved_flags
from .schemas import DiagramContent
from .seed import seed

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="SenseAtlas API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
ALLOWED = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


@app.on_event("startup")
def _startup() -> None:
    init_db()
    seed()


# ---------------------------------------------------------------- helpers
def _user_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "institution": u.institution, "prefs": u.prefs or {}}


def _own_resource(session: Session, rid: int, teacher: User) -> Resource:
    res = session.get(Resource, rid)
    # 404 rather than 403 so IDs of other teachers' drafts are not revealed
    if not res or res.owner_id != teacher.id:
        raise HTTPException(404, "Resource not found.")
    return res


def _published(session: Session, rid: int) -> Resource:
    res = session.get(Resource, rid)
    if not res or res.status != "published":
        raise HTTPException(404, "Lesson not found or not published yet.")
    return res


def _diagrams_with_content(session: Session, rid: int) -> list[tuple[Diagram, DiagramContentRow | None]]:
    diagrams = session.exec(select(Diagram).where(Diagram.resource_id == rid).order_by(Diagram.id)).all()
    out = []
    for d in diagrams:
        row = session.exec(select(DiagramContentRow).where(DiagramContentRow.diagram_id == d.id)).first()
        out.append((d, row))
    return out


def _flag_count(session: Session, rid: int) -> int:
    total = 0
    for _, row in _diagrams_with_content(session, rid):
        if row:
            total += unresolved_flags(DiagramContent.model_validate(row.content))
    return total


def _resource_out(session: Session, r: Resource) -> dict:
    owner = session.get(User, r.owner_id)
    return {"id": r.id, "title": r.title, "subject": r.subject, "topic": r.topic, "audience": r.audience,
            "filename": r.filename, "status": r.status, "progress_step": r.progress_step, "error": r.error,
            "created_at": r.created_at, "updated_at": r.updated_at, "published_at": r.published_at,
            "teacher": owner.name if owner else "", "unresolved_flags": _flag_count(session, r.id)}


def _log(session: Session, res: Resource, teacher: User, action: str, note: str = "") -> None:
    session.add(ReviewRecord(resource_id=res.id, teacher_id=teacher.id, action=action, note=note))


# ---------------------------------------------------------------- system + auth
@app.get("/system")
def system() -> dict:
    return {"ai_enabled": config.ai_enabled(), "provider": "groq" if config.ai_enabled() else "demo",
            "vision_model": config.GROQ_VISION_MODEL if config.ai_enabled() else None,
            "tts": tts.status(),
            "languages": {"enabled": yarngpt.enabled(), "options": yarngpt.LANGUAGES}}


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    lang: str = Field(default="en", pattern="^[a-z]{2,3}$")


@app.post("/tts")
def text_to_speech(body: SpeakIn) -> Response:
    """English: Groq voice for browsers without built-in voices. Other languages: YarnGPT
    translates and speaks. Public so the landing page can talk; text is capped and audio cached."""
    try:
        audio, media = tts.speak(body.text, body.lang)
    except tts.SpeechUnavailable as e:
        who = "Groq" if body.lang == "en" else "YarnGPT"
        raise HTTPException(503, f"The {who} voice isn't available: {e}.")
    return Response(audio, media_type=media, headers={"Cache-Control": "private, max-age=86400"})


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(pattern=EMAIL_RE)
    password: str = Field(min_length=8, max_length=200)
    role: str = Field(pattern="^(teacher|student)$")
    institution: str = ""


class LoginIn(BaseModel):
    email: str
    password: str


@app.post("/auth/register")
def register(body: RegisterIn, session: Session = Depends(get_session)) -> dict:
    email = body.email.lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    user = User(name=body.name.strip(), email=email, password_hash=hash_password(body.password),
                role=body.role, institution=body.institution.strip())
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"token": issue_token(session, user), "user": _user_out(user)}


@app.post("/auth/login")
def login(body: LoginIn, session: Session = Depends(get_session)) -> dict:
    user = session.exec(select(User).where(User.email == body.email.lower())).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect.")
    return {"token": issue_token(session, user), "user": _user_out(user)}


@app.post("/auth/logout")
def logout(user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    for t in session.exec(select(AuthToken).where(AuthToken.user_id == user.id)).all():
        session.delete(t)
    session.commit()
    return {"ok": True}


@app.get("/auth/me")
def me(user: User = Depends(current_user)) -> dict:
    return _user_out(user)


@app.put("/auth/me/prefs")
def save_prefs(prefs: dict[str, Any], user: User = Depends(current_user),
               session: Session = Depends(get_session)) -> dict:
    allowed = {"textScale", "contrast", "speechRate", "verbosity", "reduceMotion", "screenReader", "listenLanguage"}
    user.prefs = {k: v for k, v in prefs.items() if k in allowed}
    session.add(user)
    session.commit()
    return _user_out(user)


# ---------------------------------------------------------------- teacher: resources
@app.post("/resources/upload")
async def upload(background: BackgroundTasks, file: UploadFile = File(...), title: str = Form(...),
                 subject: str = Form(""), topic: str = Form(""), audience: str = Form(""),
                 teacher: User = Depends(require_teacher), session: Session = Depends(get_session)) -> dict:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(415, "This file type isn't supported yet. Upload a PDF, PNG or JPG file.")
    res = Resource(owner_id=teacher.id, title=title.strip() or "Untitled resource", subject=subject,
                   topic=topic, audience=audience, filename=file.filename or "", mime_type=ALLOWED[suffix])
    session.add(res)
    session.commit()
    session.refresh(res)
    folder = config.STORAGE_DIR / f"resource-{res.id}"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"original{suffix}"
    size = 0
    with target.open("wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > config.MAX_UPLOAD_MB * 1024 * 1024:
                out.close()
                shutil.rmtree(folder, ignore_errors=True)
                session.delete(res)
                session.commit()
                raise HTTPException(413, f"This file is larger than {config.MAX_UPLOAD_MB} MB. Upload a smaller file.")
            out.write(chunk)
    res.file_path = str(target)
    session.add(res)
    session.commit()
    background.add_task(process_resource, res.id)
    return _resource_out(session, res)


@app.get("/resources")
def list_resources(user: User = Depends(current_user), session: Session = Depends(get_session)) -> list[dict]:
    q = select(Resource).order_by(Resource.created_at.desc())
    q = q.where(Resource.owner_id == user.id) if user.role == "teacher" else q.where(Resource.status == "published")
    return [_resource_out(session, r) for r in session.exec(q).all()]


@app.get("/resources/{rid}")
def get_resource(rid: int, teacher: User = Depends(require_teacher), session: Session = Depends(get_session)) -> dict:
    res = _own_resource(session, rid, teacher)
    out = _resource_out(session, res)
    out["diagrams"] = [{"id": d.id, "page": d.page, "caption": d.caption, "found_labels": d.found_labels,
                        "has_content": row is not None} for d, row in _diagrams_with_content(session, rid)]
    out["history"] = [{"action": h.action, "note": h.note, "created_at": h.created_at} for h in session.exec(
        select(ReviewRecord).where(ReviewRecord.resource_id == rid).order_by(ReviewRecord.created_at.desc())).all()]
    out["text_excerpt"] = res.extracted_text[:4000]
    return out


@app.get("/resources/{rid}/status")
def resource_status(rid: int, teacher: User = Depends(require_teacher), session: Session = Depends(get_session)) -> dict:
    res = _own_resource(session, rid, teacher)
    return {"status": res.status, "progress_step": res.progress_step, "error": res.error}


@app.post("/resources/{rid}/process")
def reprocess(rid: int, background: BackgroundTasks, teacher: User = Depends(require_teacher),
              session: Session = Depends(get_session)) -> dict:
    res = _own_resource(session, rid, teacher)
    if res.status == "processing":
        raise HTTPException(409, "This resource is already being processed.")
    res.status, res.progress_step, res.published_at = "processing", "queued", None
    _log(session, res, teacher, "reprocess")
    session.add(res)
    session.commit()
    background.add_task(process_resource, res.id)
    return {"status": res.status}


@app.get("/resources/{rid}/diagrams")
def resource_diagrams(rid: int, teacher: User = Depends(require_teacher), session: Session = Depends(get_session)) -> list[dict]:
    _own_resource(session, rid, teacher)
    return [{"id": d.id, "page": d.page, "caption": d.caption, "found_labels": d.found_labels,
             "content": row.content if row else None, "version": row.version if row else 0}
            for d, row in _diagrams_with_content(session, rid)]


@app.post("/resources/{rid}/approve")
def approve(rid: int, teacher: User = Depends(require_teacher), session: Session = Depends(get_session)) -> dict:
    res = _own_resource(session, rid, teacher)
    if res.status not in ("needs_review", "approved"):
        raise HTTPException(409, f"A resource that is '{res.status}' can't be approved.")
    left = _flag_count(session, rid)
    if left:
        raise HTTPException(409, f"{left} flagged item{'s' if left != 1 else ''} still need review before approval.")
    res.status, res.updated_at = "approved", now()
    _log(session, res, teacher, "approve")
    session.add(res)
    session.commit()
    return _resource_out(session, res)


@app.post("/resources/{rid}/publish")
def publish(rid: int, teacher: User = Depends(require_teacher), session: Session = Depends(get_session)) -> dict:
    res = _own_resource(session, rid, teacher)
    if res.status != "approved":
        raise HTTPException(409, "Approve this resource before publishing it.")
    res.status, res.published_at, res.updated_at = "published", now(), now()
    _log(session, res, teacher, "publish")
    session.add(res)
    session.commit()
    return _resource_out(session, res)


@app.post("/resources/{rid}/withdraw")
def withdraw(rid: int, teacher: User = Depends(require_teacher), session: Session = Depends(get_session)) -> dict:
    res = _own_resource(session, rid, teacher)
    if res.status != "published":
        raise HTTPException(409, "Only published resources can be withdrawn.")
    res.status, res.published_at, res.updated_at = "approved", None, now()
    _log(session, res, teacher, "withdraw")
    session.add(res)
    session.commit()
    return _resource_out(session, res)


@app.delete("/resources/{rid}")
def delete_resource(rid: int, teacher: User = Depends(require_teacher), session: Session = Depends(get_session)) -> dict:
    res = _own_resource(session, rid, teacher)
    for model in (ChatMessage, LearningProgress, ReviewRecord):
        for row in session.exec(select(model).where(model.resource_id == rid)).all():
            session.delete(row)
    for d, row in _diagrams_with_content(session, rid):
        if row:
            session.delete(row)
        session.delete(d)
    session.delete(res)
    session.commit()
    shutil.rmtree(config.STORAGE_DIR / f"resource-{rid}", ignore_errors=True)
    return {"ok": True}


# ---------------------------------------------------------------- diagrams
def _user_from_query_token(token: str = Query(""), session: Session = Depends(get_session)) -> User:
    row = session.get(AuthToken, token) if token else None
    user = session.get(User, row.user_id) if row else None
    if not user:
        raise HTTPException(401, "Sign in to view this image.")
    return user


@app.get("/diagrams/{did}/image")
def diagram_image(did: int, user: User = Depends(_user_from_query_token), session: Session = Depends(get_session)):
    d = session.get(Diagram, did)
    res = session.get(Resource, d.resource_id) if d else None
    if not d or not res or not (res.owner_id == user.id or res.status == "published"):
        raise HTTPException(404, "Image not found.")
    return FileResponse(d.image_path)


@app.get("/diagrams/{did}/content")
def get_content(did: int, teacher: User = Depends(require_teacher), session: Session = Depends(get_session)) -> dict:
    d = session.get(Diagram, did)
    if not d:
        raise HTTPException(404, "Diagram not found.")
    _own_resource(session, d.resource_id, teacher)
    row = session.exec(select(DiagramContentRow).where(DiagramContentRow.diagram_id == did)).first()
    if not row:
        raise HTTPException(404, "This diagram has not been processed yet.")
    return {"content": row.content, "version": row.version}


class ContentPatch(BaseModel):
    content: DiagramContent
    version: int
    note: str = ""


@app.patch("/diagrams/{did}/content")
def patch_content(did: int, body: ContentPatch, teacher: User = Depends(require_teacher),
                  session: Session = Depends(get_session)) -> dict:
    d = session.get(Diagram, did)
    if not d:
        raise HTTPException(404, "Diagram not found.")
    res = _own_resource(session, d.resource_id, teacher)
    row = session.exec(select(DiagramContentRow).where(DiagramContentRow.diagram_id == did)).first()
    if not row:
        raise HTTPException(404, "This diagram has not been processed yet.")
    if body.version != row.version:
        raise HTTPException(409, "This content changed in another tab. Reload to see the latest version.")
    content = body.content
    ids = {s.id for s in content.structures}
    for s in content.structures:
        s.adjacent_to = [i for i in s.adjacent_to if i in ids and i != s.id]
        s.connections = [c for c in s.connections if c.to in ids]
    for p in content.processes:
        for st in p.steps:
            st.structure_ids = [i for i in st.structure_ids if i in ids]
    for q in content.quiz:
        q.answer = min(max(q.answer, 0), max(len(q.options) - 1, 0))
    row.content, row.version, row.updated_at = content.model_dump(), row.version + 1, now()
    if res.status in ("approved", "published"):
        res.status, res.published_at = "needs_review", None  # edits require re-approval
    res.updated_at = now()
    _log(session, res, teacher, "edit", body.note)
    session.add(row)
    session.add(res)
    session.commit()
    return {"content": row.content, "version": row.version, "resource_status": res.status,
            "unresolved_flags": _flag_count(session, res.id)}


# ---------------------------------------------------------------- student: lessons
def _public_content(content: dict) -> dict:
    c = DiagramContent.model_validate(content).model_dump(
        exclude={"ai_note": True, "structures": {"__all__": {"flags", "reviewed"}}, "quiz": {"__all__": {"flags", "reviewed"}}})
    return c


def _progress(session: Session, rid: int, sid: int, create: bool = False) -> Optional[LearningProgress]:
    p = session.exec(select(LearningProgress).where(LearningProgress.resource_id == rid,
                                                    LearningProgress.student_id == sid)).first()
    if not p and create:
        p = LearningProgress(resource_id=rid, student_id=sid)
        session.add(p)
        session.commit()
        session.refresh(p)
    return p


def _progress_out(p: Optional[LearningProgress]) -> dict:
    if not p:
        return {"structures_viewed": [], "steps_completed": 0, "best_score": None, "quiz_total": None}
    return {"structures_viewed": p.structures_viewed, "steps_completed": p.steps_completed,
            "best_score": p.best_score, "quiz_total": p.quiz_total, "last_opened_at": p.last_opened_at}


@app.get("/lessons")
def list_lessons(student: User = Depends(require_student), session: Session = Depends(get_session)) -> list[dict]:
    out = []
    for r in session.exec(select(Resource).where(Resource.status == "published").order_by(Resource.published_at.desc())).all():
        item = _resource_out(session, r)
        item.pop("unresolved_flags", None)
        diagrams = _diagrams_with_content(session, r.id)
        item["structure_count"] = sum(len((row.content or {}).get("structures", [])) for _, row in diagrams if row)
        item["progress"] = _progress_out(_progress(session, r.id, student.id))
        out.append(item)
    return out


@app.get("/lessons/{rid}")
def get_lesson(rid: int, user: User = Depends(current_user), session: Session = Depends(get_session)) -> dict:
    res = session.get(Resource, rid)
    is_owner_preview = user.role == "teacher" and res is not None and res.owner_id == user.id
    if not is_owner_preview:
        res = _published(session, rid)
    owner = session.get(User, res.owner_id)
    diagrams = [{"id": d.id, "page": d.page, "caption": d.caption, "content": _public_content(row.content)}
                for d, row in _diagrams_with_content(session, rid) if row]
    progress = None
    if user.role == "student":
        p = _progress(session, rid, user.id, create=True)
        p.last_opened_at = now()
        session.add(p)
        session.commit()
        progress = _progress_out(p)
    return {"id": res.id, "title": res.title, "subject": res.subject, "topic": res.topic,
            "audience": res.audience, "teacher": owner.name if owner else "", "status": res.status,
            "published_at": res.published_at, "lecture_text": res.extracted_text, "diagrams": diagrams,
            "progress": progress, "preview": is_owner_preview}


class ProgressIn(BaseModel):
    structure_id: Optional[str] = None
    steps_completed: Optional[int] = None


@app.post("/lessons/{rid}/progress")
def save_progress(rid: int, body: ProgressIn, student: User = Depends(require_student),
                  session: Session = Depends(get_session)) -> dict:
    _published(session, rid)
    p = _progress(session, rid, student.id, create=True)
    if body.structure_id and body.structure_id not in p.structures_viewed:
        p.structures_viewed = [*p.structures_viewed, body.structure_id]
    if body.steps_completed is not None:
        p.steps_completed = max(p.steps_completed, body.steps_completed)
    session.add(p)
    session.commit()
    return _progress_out(p)


class TicketIn(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    lang: str = Field(pattern="^[a-z]{2,3}$")


@app.post("/tts/ticket")
def tts_ticket(body: TicketIn) -> dict:
    """For translated listening: returns a URL an <audio> element can stream from."""
    try:
        key = tts.ticket(body.text, body.lang)
    except tts.SpeechUnavailable as e:
        raise HTTPException(503, f"The YarnGPT voice isn't available: {e}.")
    return {"url": f"/tts/audio/{key}"}


@app.get("/tts/audio/{key}")
def tts_audio(key: str):
    if not key.isalnum() or len(key) != 32:
        raise HTTPException(404, "Audio not found.")
    path = tts.cached_audio(key)
    if path:
        return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"})
    try:
        return StreamingResponse(tts.stream_audio(key), media_type="audio/mpeg")
    except tts.SpeechUnavailable as e:
        raise HTTPException(503, f"The YarnGPT voice isn't available: {e}.")


class QuestionIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


@app.get("/lessons/{rid}/questions")
def chat_history(rid: int, student: User = Depends(require_student), session: Session = Depends(get_session)) -> list[dict]:
    _published(session, rid)
    rows = session.exec(select(ChatMessage).where(ChatMessage.resource_id == rid, ChatMessage.student_id == student.id)
                        .order_by(ChatMessage.created_at)).all()
    return [{"role": m.role, "text": m.text, "grounding": m.grounding, "cited_structure_ids": m.cited_structure_ids}
            for m in rows]


@app.post("/lessons/{rid}/questions")
def ask(rid: int, body: QuestionIn, student: User = Depends(require_student), session: Session = Depends(get_session)) -> dict:
    res = _published(session, rid)
    pairs = _diagrams_with_content(session, rid)
    if not pairs or not pairs[0][1]:
        raise HTTPException(409, "This lesson has no diagram content to ask about.")
    merged = DiagramContent.model_validate(pairs[0][1].content)
    for _, row in pairs[1:]:
        if row:
            extra = DiagramContent.model_validate(row.content)
            merged.structures += extra.structures
            merged.processes += extra.processes
    history = [{"role": m.role, "text": m.text} for m in session.exec(
        select(ChatMessage).where(ChatMessage.resource_id == rid, ChatMessage.student_id == student.id)
        .order_by(ChatMessage.created_at)).all()]
    out = qa.answer(body.question.strip(), merged, res.extracted_text, history)
    session.add(ChatMessage(resource_id=rid, student_id=student.id, role="student", text=body.question.strip()))
    session.add(ChatMessage(resource_id=rid, student_id=student.id, role="companion", text=out["answer"],
                            grounding=out["grounding"], cited_structure_ids=out["cited_structure_ids"]))
    session.commit()
    return {"role": "companion", "text": out["answer"], "grounding": out["grounding"],
            "cited_structure_ids": out["cited_structure_ids"]}


class QuizIn(BaseModel):
    answers: dict[str, int]


@app.post("/lessons/{rid}/quiz-attempts")
def quiz_attempt(rid: int, body: QuizIn, student: User = Depends(require_student),
                 session: Session = Depends(get_session)) -> dict:
    _published(session, rid)
    items = []
    for _, row in _diagrams_with_content(session, rid):
        if row:
            items += DiagramContent.model_validate(row.content).quiz
    results = [{"id": q.id, "correct": body.answers.get(q.id) == q.answer, "answer": q.answer,
                "explanation": q.explanation} for q in items]
    score = sum(r["correct"] for r in results)
    p = _progress(session, rid, student.id, create=True)
    if p.best_score is None or score > p.best_score:
        p.best_score = score
    p.quiz_total = len(items)
    session.add(p)
    session.commit()
    return {"score": score, "total": len(items), "results": results, "progress": _progress_out(p)}
