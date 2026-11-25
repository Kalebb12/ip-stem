"""Minimal token auth: PBKDF2 password hashes + opaque bearer tokens."""
from __future__ import annotations

import hashlib
import hmac
import secrets

from fastapi import Depends, Header, HTTPException
from sqlmodel import Session

from .db import get_session
from .models import AuthToken, User


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    salt, _, digest = stored.partition("$")
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()
    return hmac.compare_digest(candidate, digest)


def issue_token(session: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    session.add(AuthToken(token=token, user_id=user.id))
    session.commit()
    return token


def current_user(
    authorization: str = Header(default=""), session: Session = Depends(get_session)
) -> User:
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(401, "Sign in to continue.")
    row = session.get(AuthToken, token)
    user = session.get(User, row.user_id) if row else None
    if not user:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    return user


def require_teacher(user: User = Depends(current_user)) -> User:
    if user.role != "teacher":
        raise HTTPException(403, "Only teachers can do this.")
    return user


def require_student(user: User = Depends(current_user)) -> User:
    if user.role != "student":
        raise HTTPException(403, "Only students can do this.")
    return user
