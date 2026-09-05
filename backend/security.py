"""Access-token generation/verification and per-IP rate limiting."""

import secrets
import threading
import time
from collections import defaultdict

# Unambiguous alphabet: 0/O, 1/I/L are excluded so a token read aloud at the
# table, or copied from a screenshot, cannot be mistyped into another account.
ACCESS_TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # noqa: S105 - alphabet, not a secret
ACCESS_TOKEN_LENGTH = 6

_rate_lock = threading.Lock()
_login_timestamps: dict[str, list[float]] = defaultdict(list)
_chat_timestamps: dict[str, list[float]] = defaultdict(list)


def generate_access_token() -> str:
    """Return a fresh 6-character access token (~2^29.7 of entropy).

    The keyspace is deliberately small enough to be typed by hand, so the real
    brute-force defence is the two-tier rate limit in `check_rate` plus the
    ability of a GM to revoke a token instantly. Never widen the login rate
    windows without revisiting that trade-off.
    """
    return "".join(secrets.choice(ACCESS_TOKEN_ALPHABET) for _ in range(ACCESS_TOKEN_LENGTH))


def normalize_access_token(value: object) -> str:
    """Uppercase a typed token and drop separators players add on their own.

    Deliberately does not truncate: an over-long input is a typo, and silently
    logging someone in on its first six characters would hide that.
    """
    if not isinstance(value, str):
        return ""
    return "".join(c for c in value.upper() if c.isalnum())


def is_access_token(value: str) -> bool:
    return len(value) == ACCESS_TOKEN_LENGTH and all(c in ACCESS_TOKEN_ALPHABET for c in value)


def check_rate(store: dict[str, list[float]], ip: str, limit: int, window: int) -> bool:
    """Return True if request is allowed; False if rate-limited. Thread-safe."""
    now = time.monotonic()
    with _rate_lock:
        cutoff = now - window
        store[ip] = [t for t in store[ip] if t > cutoff]
        if len(store[ip]) >= limit:
            return False
        store[ip].append(now)
        return True
