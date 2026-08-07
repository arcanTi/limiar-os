"""Transport-independent authorization policies."""

from collections.abc import Mapping


def is_staff(session: Mapping[str, str] | None) -> bool:
    return bool(session and session.get("role") in {"admin", "gm"})


def owns_character(record: Mapping[str, object] | None, session: Mapping[str, str]) -> bool:
    if not record:
        return False
    owner = str(record.get("ownerUsername") or record.get("createdBy") or "")
    return owner == session["username"]
