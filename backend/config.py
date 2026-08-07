"""Static configuration: paths, limits, rate windows, credentials, image types."""

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
UPLOAD_DIR = ROOT / "uploads"
DATABASE_URL = os.environ.get("LIMIAR_DATABASE_URL", "").strip()
POSTGRES_SCHEMA_PATH = ROOT / "backend" / "sql" / "postgres.sql"
SEED_PATH = DATA_DIR / "seed" / "limiar-seed.json"
REFERENCE_DIR = DATA_DIR / "seed"
INDEX_FILE = "index.html"

# Static file allowlist. ROOT itself is not servable because it contains the
# backend source, local configuration and repository metadata.
STATIC_DIRS = frozenset({"dist", "assets", "vendor", "uploads"})
STATIC_FILES = frozenset(
    {
        "favicon.ico",
    }
)
HTML_ENTRY_FILES = {
    INDEX_FILE: INDEX_FILE,
    "Limiar OS.dc-2.html": INDEX_FILE,
    "login.html": "login.html",
    "campaign-map.html": "campaign-map.html",
}

DEFAULT_GM_USER = os.environ.get("LIMIAR_GM_USER", "mestre")
DEFAULT_GM_PASSWORD = os.environ.get("LIMIAR_GM_PASSWORD", "limiar-master-2077")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
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
}
# SVG is deliberately excluded: it's an XSS vector (can embed <script>) and
# uploads are served inline at /uploads/ without CSP protection.
# Rate limiting: (max_requests, window_seconds)
_LOGIN_RATE = (10, 60)  # 10 login attempts per minute per IP (anti brute-force)
_CHAT_RATE = (30, 60)  # 30 chat messages per minute per IP (anti spam)
# Idle lifetime of a GM session. Every authenticated request slides this window
# forward (a "silent handshake"), so an active client - even across a 4-6h game
# session - never gets logged out, while a forgotten/abandoned token still dies
# after this much inactivity. Override with LIMIAR_SESSION_TTL (seconds).
SESSION_TTL_SECONDS = int(os.environ.get("LIMIAR_SESSION_TTL", str(8 * 3600)))
# "Lembrar-me" at login trades the 8h idle window above for this much longer one.
REMEMBER_SESSION_TTL_SECONDS = int(
    os.environ.get("LIMIAR_REMEMBER_SESSION_TTL", str(30 * 24 * 3600))
)
# Sliding sessions are renewed at most once per interval instead of on every
# authenticated request. A busy GM tab can issue tens of thousands of reads a
# day, and none of those reads should become an unnecessary write.
SESSION_TOUCH_INTERVAL_SECONDS = int(os.environ.get("LIMIAR_SESSION_TOUCH_INTERVAL", "900"))
