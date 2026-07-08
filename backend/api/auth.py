"""Auth routes: login, logout, session introspection."""

import secrets
from http import HTTPStatus

from ..config import _LOGIN_RATE, SESSION_TTL_SECONDS
from ..db import db
from ..domain.validation import ValidationError, validate_login, validate_user
from ..security import _login_timestamps, check_rate, password_hash, verify_password


class AuthRoutes:
    """Routes for login, logout, and session introspection."""

    def _public_user(self, row) -> dict[str, object]:
        return {
            "username": row["username"],
            "role": row["role"],
            "createdAt": row["created_at"],
        }

    def _get_session(self) -> None:
        session = self.current_session()
        self.write_json({"authenticated": bool(session), "user": session or None})

    def _post_login(self) -> None:
        ip = self.client_address[0]
        if not check_rate(_login_timestamps, ip, *_LOGIN_RATE):
            return self.write_error(HTTPStatus.TOO_MANY_REQUESTS, "Too many login attempts")
        try:
            payload = self.read_json()
            username, password = validate_login(payload)
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        with db() as conn:
            user = conn.execute(
                "SELECT username, password_hash, role FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            if not user or not verify_password(password, user["password_hash"]):
                return self.write_error(HTTPStatus.UNAUTHORIZED, "Invalid credentials")
            # On-login migration: upgrade legacy SHA-256 hash to PBKDF2 transparently.
            if not user["password_hash"].startswith("pbkdf2:"):
                conn.execute(
                    "UPDATE users SET password_hash = ? WHERE username = ?",
                    (password_hash(password), user["username"]),
                )
            token = secrets.token_urlsafe(32)
            conn.execute(
                "INSERT INTO sessions(token, username, role, expires_at)"
                " VALUES (?, ?, ?, datetime('now', ?))",
                (token, user["username"], user["role"], f"+{SESSION_TTL_SECONDS} seconds"),
            )
            # Opportunistic cleanup of stale tokens on every successful login.
            conn.execute(
                "DELETE FROM sessions"
                " WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')",
            )
        return self.write_json(
            {
                "token": token,
                "user": {"username": username, "role": user["role"]},
            }
        )

    def _post_register(self) -> None:
        ip = self.client_address[0]
        if not check_rate(_login_timestamps, ip, *_LOGIN_RATE):
            return self.write_error(HTTPStatus.TOO_MANY_REQUESTS, "Too many login attempts")
        try:
            payload = self.read_json()
            username, password, _role = validate_user({**payload, "role": "player"})
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        with db() as conn:
            existing = conn.execute(
                "SELECT username FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            if existing:
                return self.write_error(HTTPStatus.CONFLICT, "User already exists")
            conn.execute(
                "INSERT INTO users(username, password_hash, role) VALUES (?, ?, 'player')",
                (username, password_hash(password)),
            )
            token = secrets.token_urlsafe(32)
            conn.execute(
                "INSERT INTO sessions(token, username, role, expires_at)"
                " VALUES (?, ?, 'player', datetime('now', ?))",
                (token, username, f"+{SESSION_TTL_SECONDS} seconds"),
            )
        return self.write_json(
            {
                "token": token,
                "user": {"username": username, "role": "player"},
            },
            HTTPStatus.CREATED,
        )

    def _post_logout(self) -> None:
        session = self.current_session()
        if session:
            with db() as conn:
                conn.execute("DELETE FROM sessions WHERE token = ?", (session["token"],))
        self.write_json({"ok": True})

    def _get_users(self) -> None:
        session = self.require_gm()
        if not session:
            return None
        with db() as conn:
            rows = conn.execute(
                "SELECT username, role, created_at FROM users ORDER BY username",
            ).fetchall()
        self.write_json([self._public_user(row) for row in rows])

    def _post_users(self) -> None:
        session = self.require_admin()
        if not session:
            return None
        try:
            payload = self.read_json()
            with db() as conn:
                existing_user = conn.execute(
                    "SELECT username FROM users WHERE username = ?",
                    (str(payload.get("username") or ""),),
                ).fetchone()
            username, password, role = validate_user(payload, password_optional=bool(existing_user))
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        with db() as conn:
            existing = conn.execute(
                "SELECT username FROM users WHERE username = ?",
                (username,),
            ).fetchone()
            if existing:
                if username == session["username"] and role != "admin":
                    return self.write_error(HTTPStatus.BAD_REQUEST, "Admin cannot demote itself")
                if password:
                    conn.execute(
                        "UPDATE users SET password_hash = ?, role = ? WHERE username = ?",
                        (password_hash(password), role, username),
                    )
                else:
                    conn.execute("UPDATE users SET role = ? WHERE username = ?", (role, username))
                conn.execute("DELETE FROM sessions WHERE username = ?", (username,))
            else:
                if not password:
                    return self.write_error(HTTPStatus.BAD_REQUEST, "Password required")
                conn.execute(
                    "INSERT INTO users(username, password_hash, role) VALUES (?, ?, ?)",
                    (username, password_hash(password), role),
                )
            row = conn.execute(
                "SELECT username, role, created_at FROM users WHERE username = ?",
                (username,),
            ).fetchone()
        self.write_json(self._public_user(row), HTTPStatus.CREATED if not existing else HTTPStatus.OK)

    def _delete_user(self, username: str) -> None:
        session = self.require_admin()
        if not session:
            return None
        if username == session["username"]:
            return self.write_error(HTTPStatus.BAD_REQUEST, "Admin cannot delete itself")
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE username = ?", (username,))
            cur = conn.execute("DELETE FROM users WHERE username = ?", (username,))
        self.write_json({"deleted": cur.rowcount > 0})
