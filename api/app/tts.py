"""Server-side text-to-speech via Groq, the alternative for browsers that have no voices
(for example Chrome on Linux, which ships with speech disabled). Everywhere else the
browser's own voice is used and this endpoint is never called.

Needs the Groq TTS model's terms accepted once by the org admin:
https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english
Audio is cached on disk by a hash of the text and voice.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time

from . import config

log = logging.getLogger(__name__)
CACHE = config.DATA_DIR / "tts"
CACHE.mkdir(parents=True, exist_ok=True)
GROQ_TTS_MODEL = os.getenv("GROQ_TTS_MODEL", "canopylabs/orpheus-v1-english")
GROQ_TTS_VOICE = os.getenv("GROQ_TTS_VOICE", "hannah")

_blocked_until = 0.0
_last_error = ""


class SpeechUnavailable(RuntimeError):
    pass


def status() -> dict:
    return {"engine": "groq" if config.ai_enabled() else None, "model": GROQ_TTS_MODEL,
            "ready": config.ai_enabled() and time.time() >= _blocked_until, "last_error": _last_error}


def speak(text: str, lang: str = "en") -> tuple[bytes, str]:
    """(audio, media type). English uses the Groq voice; other languages go to YarnGPT,
    which translates the text and speaks it with a Nigerian voice."""
    from . import yarngpt

    if lang == "en":
        return speak_to_wav(text), "audio/wav"
    if lang not in yarngpt.LANGUAGES:
        raise SpeechUnavailable(f"listening in '{lang}' isn't supported")
    text = " ".join(text.split())[:4000]
    key = hashlib.sha256(f"yarngpt|{lang}|{yarngpt.FIXED_VOICE}|{text}".encode()).hexdigest()[:32]
    cached = CACHE / f"{key}.mp3"
    if cached.exists():
        return cached.read_bytes(), "audio/mpeg"
    try:
        audio, media, _voice = yarngpt.synthesize(text, lang)
    except yarngpt.YarnError as e:
        log.warning("YarnGPT failed: %s", e)
        raise SpeechUnavailable(str(e)) from e
    if media == "audio/mpeg":
        cached.write_bytes(audio)  # every YarnGPT call spends credits, so never generate twice
    return audio, media


def speak_to_wav(text: str) -> bytes:
    global _blocked_until, _last_error
    text = " ".join(text.split())[:1200]
    key = hashlib.sha256(f"{GROQ_TTS_MODEL}|{GROQ_TTS_VOICE}|{text}".encode()).hexdigest()[:32]
    cached = CACHE / f"{key}.wav"
    if cached.exists():
        return cached.read_bytes()
    if not config.ai_enabled():
        raise SpeechUnavailable("no Groq API key is configured")
    if time.time() < _blocked_until:
        raise SpeechUnavailable(_last_error)

    import groq

    try:
        client = groq.Groq(api_key=config.GROQ_API_KEY, timeout=30, max_retries=1)
        audio = client.audio.speech.create(model=GROQ_TTS_MODEL, voice=GROQ_TTS_VOICE, input=text,
                                           response_format="wav").read()
    except groq.APIError as e:
        msg = str(e)
        if "terms" in msg:
            _last_error = "the Groq voice model's terms haven't been accepted in the Groq console yet"
            _blocked_until = time.time() + 120
        elif "429" in msg or "rate" in msg.lower():
            _last_error = "the Groq rate limit was reached; try again in a minute"
            _blocked_until = time.time() + 30
        else:
            _last_error = "the Groq voice service returned an error"
        log.warning("Groq TTS failed: %s", msg[:200])
        raise SpeechUnavailable(_last_error) from e
    cached.write_bytes(audio)
    return audio


# ---------------------------------------------------------------- streamed YarnGPT audio
# The browser asks for a ticket (POST), then points an <audio> element at the ticket URL (GET),
# which streams YarnGPT's MP3 through as it is generated and caches it once complete.
_pending: dict[str, tuple[str, str, float]] = {}


def ticket(text: str, lang: str) -> str:
    from . import yarngpt

    if lang not in yarngpt.LANGUAGES or lang == "en":
        raise SpeechUnavailable(f"streamed listening in '{lang}' isn't supported")
    if not yarngpt.enabled():
        raise SpeechUnavailable("no YarnGPT API key is configured (set YARNGPT_API_KEY in api/.env)")
    text = " ".join(text.split())[:4000]
    key = hashlib.sha256(f"yarngpt|{lang}|{yarngpt.FIXED_VOICE}|{text}".encode()).hexdigest()[:32]
    if not (CACHE / f"{key}.mp3").exists():
        now = time.time()
        for k, (_t, _l, at) in list(_pending.items()):
            if now - at > 1800:
                _pending.pop(k, None)
        _pending[key] = (text, lang, now)
    return key


def cached_audio(key: str):
    path = CACHE / f"{key}.mp3"
    return path if path.exists() else None


def stream_audio(key: str):
    """Yields MP3 bytes for a ticket, writing them to the cache as they pass through."""
    from . import yarngpt

    job = _pending.get(key)
    if not job:
        raise SpeechUnavailable("this audio link has expired; press play again")
    text, lang, _ = job
    try:
        source = yarngpt.stream(text, lang)
    except yarngpt.YarnError as e:
        log.warning("YarnGPT failed: %s", e)
        raise SpeechUnavailable(str(e)) from e

    def relay():
        part = CACHE / f"{key}.part"
        complete = False
        try:
            with part.open("wb") as out:
                for chunk in source:
                    out.write(chunk)
                    yield chunk
            complete = True
        finally:
            if complete:
                part.rename(CACHE / f"{key}.mp3")  # every YarnGPT call costs credits: keep it
                _pending.pop(key, None)
            else:
                part.unlink(missing_ok=True)

    return relay()
