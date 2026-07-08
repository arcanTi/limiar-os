"""Password hashing/verification and per-IP rate limiting."""

import hashlib
import secrets
import threading
import time
from collections import defaultdict

from .config import _PBKDF2_ITERATIONS

_rate_lock = threading.Lock()
_login_timestamps: dict[str, list[float]] = defaultdict(list)
_chat_timestamps: dict[str, list[float]] = defaultdict(list)


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        _PBKDF2_ITERATIONS,
    )
    return f"pbkdf2:sha256:{_PBKDF2_ITERATIONS}${salt}${dk.hex()}"


def _verify_legacy_sha256(password: str, stored: str) -> bool:
    """Verify old single-round SHA-256 format (salt$hex). Used only during migration."""
    if "$" not in stored:
        return False
    salt, expected = stored.split("$", 1)
    actual = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return secrets.compare_digest(actual, expected)


def verify_password(password: str, stored: str) -> bool:
    if not stored:
        return False
    if stored.startswith("pbkdf2:"):
        try:
            _, spec, rest = stored.split(":", 2)
            if spec != "sha256":
                return False
            iter_s, salt, expected = rest.split("$", 2)
            dk = hashlib.pbkdf2_hmac(
                "sha256",
                password.encode("utf-8"),
                salt.encode("utf-8"),
                int(iter_s),
            )
            return secrets.compare_digest(dk.hex(), expected)
        except (ValueError, AttributeError):
            return False
    return _verify_legacy_sha256(password, stored)


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
