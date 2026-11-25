"""YarnGPT text-to-speech: Nigerian voices, with translation into the listener's language.

API docs: https://yarngpt.ai/api-docs
We use the real-time route, POST /api/v1/streaming/conversation, which returns audio in the
response body. With `target_language` set, YarnGPT translates the (English) lesson text
before speaking it. Every call spends credits, so callers must cache the result.
"""
from __future__ import annotations

import logging
import os
import time
import uuid

import httpx

from . import config  # noqa: F401  (loads api/.env before the key is read)

log = logging.getLogger(__name__)

BASE = "https://api.yarngpt.ai"
API_KEY = os.getenv("YARNGPT_API_KEY", "").strip()
FIXED_VOICE = os.getenv("YARNGPT_VOICE", "").strip()  # optional; otherwise picked per language

# Languages offered to listeners. YarnGPT supports more codes (am ar de es fr lg pt rw sn sw tw wo xh zu).
LANGUAGES = {
    "en": "English",
    "yo": "Yorùbá",
    "ig": "Igbo",
    "ha": "Hausa",
    "pcm": "Naijá (Nigerian Pidgin)",
}

# the voice catalogue names languages in words ("yoruba"), not codes
LANGUAGE_NAMES = {"en": "english", "yo": "yoruba", "ig": "igbo", "ha": "hausa", "pcm": "pidgin"}
# a fitting default voice per language, used when the catalogue offers it
PREFERRED_VOICE = {"en": "idera", "yo": "idera", "ig": "adaora", "ha": "zainab", "pcm": "osagie"}

_voices: list[dict] | None = None
_voices_at = 0.0


class YarnError(RuntimeError):
    pass


def enabled() -> bool:
    return bool(API_KEY)


def _headers() -> dict:
    return {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}


def _error_message(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error", {})
        code, msg = err.get("code", ""), err.get("user_message") or err.get("message") or ""
    except ValueError:
        code, msg = "", resp.text[:200]
    if resp.status_code == 401:
        return "the YarnGPT API key was rejected"
    if resp.status_code == 402 or "CREDIT" in code.upper():
        return "the YarnGPT account is out of credits"
    if resp.status_code == 429:
        return "YarnGPT's rate limit was reached; try again shortly"
    return f"YarnGPT returned an error ({code or resp.status_code}): {msg}".strip()


def voices() -> list[dict]:
    """The voice catalogue changes over time, so read it from the API (cached for an hour)."""
    global _voices, _voices_at
    if _voices is not None and time.time() - _voices_at < 3600:
        return _voices
    try:
        resp = httpx.get(f"{BASE}/api/v1/voices", headers=_headers(), timeout=20)
        resp.raise_for_status()
        data = resp.json()
        items = data if isinstance(data, list) else data.get("voices") or data.get("data") or []
        _voices = [v for v in items if isinstance(v, dict)]
    except (httpx.HTTPError, ValueError) as e:
        log.warning("could not list YarnGPT voices: %s", e)
        _voices = []
    _voices_at = time.time()
    return _voices


def _voice_id(v: dict) -> str:
    return str(v.get("id") or v.get("name") or v.get("voice") or "")


def pick_voice(lang: str) -> str | None:
    """A voice that lists the language, else the catalogue default, else None (API default)."""
    if FIXED_VOICE:
        return FIXED_VOICE
    catalogue = voices()
    wanted = {lang, LANGUAGE_NAMES.get(lang, lang)}

    def speaks(v: dict) -> bool:
        langs = v.get("languages") or v.get("language") or []
        langs = [langs] if isinstance(langs, str) else langs
        return any(str(l).lower() in wanted for l in langs)

    matching = [v for v in catalogue if speaks(v)]
    preferred = PREFERRED_VOICE.get(lang)
    for v in matching:
        if _voice_id(v) == preferred:
            return preferred
    if matching:
        return _voice_id(matching[0]) or None
    default = next((v for v in catalogue if v.get("default")), None)
    return _voice_id(default) if default else None


def synthesize(text: str, lang: str) -> tuple[bytes, str, str | None]:
    """Returns (audio bytes, media type, voice used)."""
    if not enabled():
        raise YarnError("no YarnGPT API key is configured (set YARNGPT_API_KEY in api/.env)")
    voice = pick_voice(lang)
    body: dict = {"text": text, "output_format": "mp3"}
    if lang != "en":
        body["target_language"] = lang
    if voice:
        body["voice"] = voice
    try:
        resp = httpx.post(f"{BASE}/api/v1/streaming/conversation", json=body, timeout=90,
                          headers={**_headers(), "Idempotency-Key": uuid.uuid4().hex})
    except httpx.HTTPError as e:
        raise YarnError(f"YarnGPT could not be reached: {e}") from e
    if resp.status_code >= 400:
        raise YarnError(_error_message(resp))
    media = resp.headers.get("content-type", "audio/mpeg").split(";")[0]
    if not media.startswith("audio/"):
        raise YarnError("YarnGPT did not return audio")
    return resp.content, media, voice


def stream(text: str, lang: str):
    """Yield MP3 bytes as YarnGPT generates them (it streams at about speaking speed),
    so playback can start within seconds instead of after the whole passage is ready."""
    if not enabled():
        raise YarnError("no YarnGPT API key is configured (set YARNGPT_API_KEY in api/.env)")
    voice = pick_voice(lang)
    body: dict = {"text": text, "output_format": "mp3"}
    if lang != "en":
        body["target_language"] = lang
    if voice:
        body["voice"] = voice
    client = httpx.Client(timeout=httpx.Timeout(30, read=120))
    req = client.build_request("POST", f"{BASE}/api/v1/streaming/conversation", json=body,
                               headers={**_headers(), "Idempotency-Key": uuid.uuid4().hex})
    try:
        resp = client.send(req, stream=True)
    except httpx.HTTPError as e:
        client.close()
        raise YarnError(f"YarnGPT could not be reached: {e}") from e
    if resp.status_code >= 400:
        resp.read()
        msg = _error_message(resp)
        resp.close()
        client.close()
        raise YarnError(msg)

    def chunks():
        try:
            yield from resp.iter_bytes(8192)
        finally:
            resp.close()
            client.close()

    return chunks()
