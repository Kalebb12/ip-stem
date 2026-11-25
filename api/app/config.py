"""Runtime settings, read from environment variables (or api/.env)."""
from __future__ import annotations

import os
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]


def _load_dotenv() -> None:
    env = API_DIR / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "qwen/qwen3.8-27b")
GROQ_CHAT_MODEL = os.getenv("GROQ_CHAT_MODEL", "openai/gpt-oss-120b")
# DEMO_MODE=1: if the AI call fails, fall back to the built-in demo content instead of erroring.
DEMO_MODE = os.getenv("DEMO_MODE", "1") == "1"

DATA_DIR = Path(os.getenv("DATA_DIR", API_DIR / "data"))
STORAGE_DIR = DATA_DIR / "storage"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'app.db'}")
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")]
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "25"))

DATA_DIR.mkdir(parents=True, exist_ok=True)
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def ai_enabled() -> bool:
    return bool(GROQ_API_KEY)
