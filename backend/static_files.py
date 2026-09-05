"""Static file allow-list resolution, independent from the HTTP framework."""

from pathlib import Path
from urllib.parse import unquote, urlparse

from .config import (
    HTML_ENTRY_FILES,
    INDEX_FILE,
    ROOT,
    STATIC_DIRS,
    STATIC_FILES,
    UPLOAD_DIR,
)


def servable_path(url_path: str) -> Path | None:
    relative = unquote(urlparse(url_path).path).lstrip("/")
    if not relative:
        return ROOT / "dist" / INDEX_FILE
    if relative in HTML_ENTRY_FILES:
        return ROOT / "dist" / HTML_ENTRY_FILES[relative]
    head, _, tail = relative.partition("/")
    if head == "uploads":
        # UPLOAD_DIR is configurable and may sit outside ROOT, so this branch
        # anchors the containment check on the upload directory itself.
        return _servable_upload(tail)
    candidate = (ROOT / relative).resolve()
    try:
        parts = candidate.relative_to(ROOT).parts
    except ValueError:
        return None
    if not parts or any(part.startswith(".") for part in parts):
        return None
    if len(parts) == 1:
        return candidate if parts[0] in STATIC_FILES else None
    return candidate if parts[0] in STATIC_DIRS else None


def _servable_upload(relative: str) -> Path | None:
    if not relative:
        return None
    candidate = (UPLOAD_DIR / relative).resolve()
    try:
        parts = candidate.relative_to(UPLOAD_DIR).parts
    except ValueError:
        return None
    if not parts or any(part.startswith(".") for part in parts):
        return None
    return candidate
