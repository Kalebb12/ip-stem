"""Thin wrapper around the Groq SDK. Every call returns parsed JSON."""
from __future__ import annotations

import base64
import json
from pathlib import Path

from .. import config


class AIUnavailable(RuntimeError):
    pass


def _client():
    if not config.ai_enabled():
        raise AIUnavailable("GROQ_API_KEY is not set")
    from groq import Groq

    return Groq(api_key=config.GROQ_API_KEY, timeout=90, max_retries=2)


def _parse_json(text: str) -> dict:
    text = (text or "").strip()
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):]
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("model did not return JSON")
    return json.loads(text[start : end + 1])


def _reasoning_kwargs(model: str) -> dict:
    """Keep reasoning out of the JSON answer and stop it eating the token budget."""
    if model.startswith("openai/gpt-oss"):
        return {"reasoning_effort": "low"}
    if model.startswith("qwen/"):
        return {"reasoning_format": "hidden"}
    return {}


def _create(client, **kwargs):
    import groq

    extra = _reasoning_kwargs(kwargs["model"])
    try:
        return client.chat.completions.create(**kwargs, **extra)
    except groq.BadRequestError:
        if not extra:
            raise
        return client.chat.completions.create(**kwargs)  # model rejected the reasoning option


def chat_json(system: str, user: str, *, model: str | None = None, max_tokens: int = 2048) -> dict:
    import groq

    client = _client()
    try:
        resp = _create(
            client,
            model=model or config.GROQ_CHAT_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=max_tokens,
        )
    except groq.APIError as e:  # auth, rate limit, server, connection
        raise AIUnavailable(str(e)) from e
    return _parse_json(resp.choices[0].message.content)


def vision_json(system: str, user: str, image_path: Path, *, max_tokens: int = 8000) -> dict:
    import groq

    client = _client()
    mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
    data = base64.b64encode(image_path.read_bytes()).decode()
    try:
        resp = _create(
            client,
            model=config.GROQ_VISION_MODEL,
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}},
                    ],
                },
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=max_tokens,
        )
    except groq.APIError as e:
        raise AIUnavailable(str(e)) from e
    return _parse_json(resp.choices[0].message.content)
