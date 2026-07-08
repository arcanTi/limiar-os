"""BaseHandler: static file serving, security headers, JSON I/O, and session/GM
auth helpers. Domain route mixins build on top of this."""

import json
import logging
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from urllib.parse import unquote, urlparse

from ..config import _MAX_BODY_BYTES, INDEX_FILE, ROOT, SESSION_TTL_SECONDS
from ..db import db
from ..domain.validation import ValidationError


class BaseHandler(SimpleHTTPRequestHandler):
    """Shared HTTP plumbing for all Limiar OS routes."""

    server_version = "LimiarOS/1.0"

    def translate_path(self, path: str) -> str:
        path = unquote(urlparse(path).path)
        if path == "/":
            return str(ROOT / INDEX_FILE)
        return str(ROOT / path.lstrip("/"))

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        path = urlparse(self.path).path
        if path.startswith("/uploads/"):
            self.send_header("Content-Disposition", "inline")
        else:
            self.send_header(
                "Content-Security-Policy",
                "default-src 'self'; script-src 'self' 'unsafe-eval';"
                " style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;"
                " font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';",
            )
        super().end_headers()

    def log_message(self, format: str, *args: object) -> None:
        logging.info("[limiar] %s", format % args)

    def read_json(self) -> dict[str, object]:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        if length > _MAX_BODY_BYTES:
            raise ValidationError(["Request body too large"])
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8") or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValidationError(["Request body must be valid JSON"]) from exc

    def write_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def write_error(self, status: HTTPStatus, message: str, code: str | None = None) -> None:
        error_code = code or status.phrase.upper().replace(" ", "_")
        self.write_json({"error": {"code": error_code, "message": message}}, status)

    def current_session(self) -> dict[str, str] | None:
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        token = auth.split(" ", 1)[1].strip()
        if not token:
            return None
        with db() as conn:
            row = conn.execute(
                "SELECT token, username, role, expires_at FROM sessions WHERE token = ?",
                (token,),
            ).fetchone()
            if not row:
                return None
            # Expired tokens are deleted on contact and treated as logged out.
            expires_at = row["expires_at"]
            if expires_at is not None:
                dead = conn.execute(
                    "SELECT (? <= datetime('now')) AS dead",
                    (expires_at,),
                ).fetchone()["dead"]
                if dead:
                    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
                    return None
            # Silent handshake: slide the idle window forward on every authed hit.
            conn.execute(
                "UPDATE sessions SET expires_at = datetime('now', ?) WHERE token = ?",
                (f"+{SESSION_TTL_SECONDS} seconds", token),
            )
        return {"token": row["token"], "username": row["username"], "role": row["role"]}

    def is_staff_session(self, session: dict[str, str] | None) -> bool:
        return bool(session and session.get("role") in ("admin", "gm"))

    def is_admin_session(self, session: dict[str, str] | None) -> bool:
        return bool(session and session.get("role") == "admin")

    def require_login(self) -> dict[str, str] | None:
        session = self.current_session()
        if not session:
            self.write_error(HTTPStatus.UNAUTHORIZED, "Login required")
            return None
        return session

    def require_gm(self) -> dict[str, str] | None:
        session = self.current_session()
        if not self.is_staff_session(session):
            self.write_error(HTTPStatus.UNAUTHORIZED, "GM login required")
            return None
        return session

    def require_admin(self) -> dict[str, str] | None:
        session = self.current_session()
        if not self.is_admin_session(session):
            self.write_error(HTTPStatus.UNAUTHORIZED, "Admin login required")
            return None
        return session
