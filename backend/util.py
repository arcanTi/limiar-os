"""Generic, dependency-free helpers shared across the backend."""

from datetime import datetime, timezone


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def slug(text: object) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(text or "record"))
    out = "-".join(part for part in out.split("-") if part)
    return out or "record"
