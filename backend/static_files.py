"""Static file allow-list resolution, independent from the HTTP framework."""

from pathlib import Path
from urllib.parse import unquote, urlparse

from .config import HTML_ENTRY_FILES, INDEX_FILE, ROOT, STATIC_DIRS, STATIC_FILES


def servable_path(url_path: str) -> Path | None:
    relative = unquote(urlparse(url_path).path).lstrip("/")
    if not relative:
        return ROOT / "dist" / INDEX_FILE
    if relative in HTML_ENTRY_FILES:
        return ROOT / "dist" / HTML_ENTRY_FILES[relative]
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
