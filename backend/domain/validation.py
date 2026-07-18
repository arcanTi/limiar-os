"""Request payload validation. Pure domain rules — no DB, no HTTP."""

import re

# C0/C1 control characters except \n and \t. The template engine already
# writes text via textContent/setAttribute (safe against markup injection),
# but free-form fields that skip per-key validation (gear notes, character
# story, GM item/NPC descriptions) land straight in the `extra` JSON blob —
# this strips anything that could corrupt logs, terminals, or downstream
# tooling that isn't as careful as the renderer.
_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ValidationError(Exception):
    """Raised when a request payload fails schema validation."""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


def sanitize_text(value: str, max_len: int = 255) -> str:
    """Strip control characters and hard-truncate a string."""
    return _CONTROL_CHARS.sub("", value)[:max_len]


def sanitize_payload(value: object, *, max_len: int = 4000, _depth: int = 0) -> object:
    """Recursively sanitize every string in a JSON-like payload.

    Applied at the storage boundary (records/chat repositories) so nested
    free-text the per-field validators don't know about — gear notes,
    cyberware installed lists, GM item/NPC descriptions — can't smuggle
    control bytes or balloon a single field indefinitely.
    """
    if _depth > 12:  # guards against pathological/self-referential JSON
        return value
    if isinstance(value, str):
        return sanitize_text(value, max_len)
    if isinstance(value, list):
        return [sanitize_payload(v, max_len=max_len, _depth=_depth + 1) for v in value]
    if isinstance(value, dict):
        return {
            k: sanitize_payload(v, max_len=max_len, _depth=_depth + 1) for k, v in value.items()
        }
    return value


def _val_str(
    payload: dict[str, object], key: str, *, required: bool = False, max_len: int = 255
) -> str | None:
    val = payload.get(key)
    if val is None:
        if required:
            raise ValidationError([f"'{key}' is required"])
        return None
    if not isinstance(val, str):
        raise ValidationError([f"'{key}' must be a string"])
    stripped = sanitize_text(val.strip(), max_len)
    if required and not stripped:
        raise ValidationError([f"'{key}' must not be empty"])
    return stripped


def _val_int(payload: dict[str, object], key: str, *, required: bool = False) -> int | None:
    val = payload.get(key)
    if val is None:
        if required:
            raise ValidationError([f"'{key}' is required"])
        return None
    if not isinstance(val, int) or isinstance(val, bool):
        raise ValidationError([f"'{key}' must be an integer"])
    return val


def validate_login(payload: dict[str, object]) -> tuple[str, str]:
    username = _val_str(payload, "username", required=True, max_len=100)
    # Don't strip passwords — spaces are valid password characters.
    password = payload.get("password")
    if not isinstance(password, str) or not password:
        raise ValidationError(["'password' is required"])
    return username, password  # type: ignore[return-value]


def validate_user(payload: dict[str, object], *, password_optional: bool = False) -> tuple[str, str | None, str]:
    username = _val_str(payload, "username", required=True, max_len=100)
    role = _val_str(payload, "role", required=True, max_len=20) or "player"
    if role not in ("admin", "gm", "player"):
        raise ValidationError(["'role' must be 'admin', 'gm', or 'player'"])
    password = payload.get("password")
    if password is None or password == "":
        if not password_optional:
            raise ValidationError(["'password' is required"])
        return username, None, role
    if not isinstance(password, str) or len(password) < 8:
        raise ValidationError(["'password' must be at least 8 characters"])
    return username, password, role


def validate_email(payload: dict[str, object], *, required: bool = False) -> str | None:
    email = payload.get("email")
    if email is None or email == "":
        if required:
            raise ValidationError(["'email' is required"])
        return None
    if not isinstance(email, str) or not _EMAIL_RE.match(email.strip()):
        raise ValidationError(["'email' must be a valid email address"])
    return email.strip().lower()


def validate_character(payload: dict[str, object]) -> None:
    _val_str(payload, "name", required=True, max_len=120)
    _val_int(payload, "level")


def validate_item(payload: dict[str, object]) -> None:
    _val_str(payload, "name", required=True, max_len=120)
    _val_int(payload, "price")


def validate_map_location(payload: dict[str, object]) -> None:
    _val_str(payload, "name", required=True, max_len=120)


def validate_chat(payload: dict[str, object]) -> None:
    kind = payload.get("kind", "text")
    if kind not in ("text", "roll", "request"):
        raise ValidationError(["'kind' must be 'text', 'roll', or 'request'"])
    _val_str(payload, "sender", max_len=60)
    _val_str(payload, "text", max_len=1000)
    _val_str(payload, "at", max_len=40)


def validate_hq(payload: dict[str, object]) -> dict[str, object]:
    ip_raw = payload.get("ip", 0)
    if not isinstance(ip_raw, int) or isinstance(ip_raw, bool):
        raise ValidationError(["'ip' must be an integer"])
    log_raw = payload.get("log")
    if log_raw is not None and not isinstance(log_raw, list):
        raise ValidationError(["'log' must be an array"])
    return {
        "ip": int(ip_raw),
        "log": log_raw if isinstance(log_raw, list) else [],
    }
