"""Static configuration: paths, limits, rate windows, credentials, image types."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = ROOT / "uploads"
DB_PATH = DATA_DIR / "limiar.db"
SEED_PATH = DATA_DIR / "seed" / "limiar-seed.json"
REFERENCE_DIR = DATA_DIR / "seed"
INDEX_FILE = "Limiar OS.dc-2.html"

DEFAULT_GM_USER = os.environ.get("LIMIAR_GM_USER", "mestre")
DEFAULT_GM_PASSWORD = os.environ.get("LIMIAR_GM_PASSWORD", "limiar-master-2077")
CHAT_LIMIT = 200
_MAX_BODY_BYTES = 256 * 1024  # 256 KB — hard cap on JSON request bodies
_MAX_UPLOAD_BYTES = int(os.environ.get("LIMIAR_MAX_UPLOAD_MB", "64")) * 1024 * 1024
_PBKDF2_ITERATIONS = 260_000  # OWASP 2024 minimum for PBKDF2-SHA256
_ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
}
# Rate limiting: (max_requests, window_seconds)
_LOGIN_RATE = (10, 60)  # 10 login attempts per minute per IP (anti brute-force)
_CHAT_RATE = (30, 60)  # 30 chat messages per minute per IP (anti spam)
# Idle lifetime of a GM session. Every authenticated request slides this window
# forward (a "silent handshake"), so an active client - even across a 4-6h game
# session - never gets logged out, while a forgotten/abandoned token still dies
# after this much inactivity. Override with LIMIAR_SESSION_TTL (seconds).
SESSION_TTL_SECONDS = int(os.environ.get("LIMIAR_SESSION_TTL", str(8 * 3600)))
