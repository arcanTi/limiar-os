"""Auth routes: login, logout, session introspection."""

import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from http import HTTPStatus

from ..config import _LOGIN_RATE, GOOGLE_CLIENT_ID, REMEMBER_SESSION_TTL_SECONDS, SESSION_TTL_SECONDS
from ..db import db
from ..domain.validation import ValidationError, validate_email, validate_login, validate_user
from ..security import _login_timestamps, check_rate, password_hash, verify_password

_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo?id_token="
_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


def _verify_google_id_token(id_token: str) -> dict[str, object] | None:
    """Verify a Google Sign-In id_token via Google's tokeninfo endpoint.

    Stdlib-only verification (no JWKS/crypto dependency) — fine for this
    project's scale; Google itself documents this endpoint for exactly this
    use, just not for high-volume production traffic.
    """
    url = _GOOGLE_TOKENINFO_URL + urllib.parse.quote(id_token, safe="")
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:  # noqa: S310 (fixed https host)
            claims = json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, ValueError, TimeoutError, OSError):
        return None
    if claims.get("aud") != GOOGLE_CLIENT_ID:
        return None
    if claims.get("iss") not in _GOOGLE_ISSUERS:
        return None
    if claims.get("email_verified") not in ("true", True):
        return None
    return claims


class AuthRoutes:
    """Routes for login, logout, and session introspection."""

    def _public_user(self, row) -> dict[str, object]:
        return {
            "username": row["username"],
            "role": row["role"],
            "email": row["email"] if "email" in row.keys() else None,
            "avatarUrl": row["avatar_url"] if "avatar_url" in row.keys() else None,
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
        remember = bool(payload.get("remember"))
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
            ttl = REMEMBER_SESSION_TTL_SECONDS if remember else SESSION_TTL_SECONDS
            conn.execute(
                "INSERT INTO sessions(token, username, role, expires_at, remember)"
                " VALUES (?, ?, ?, datetime('now', ?), ?)",
                (token, user["username"], user["role"], f"+{ttl} seconds", int(remember)),
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

    def _post_google_login(self) -> None:
        ip = self.client_address[0]
        if not check_rate(_login_timestamps, ip, *_LOGIN_RATE):
            return self.write_error(HTTPStatus.TOO_MANY_REQUESTS, "Too many login attempts")
        if not GOOGLE_CLIENT_ID:
            return self.write_error(HTTPStatus.SERVICE_UNAVAILABLE, "Google login not configured")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        id_token = str(payload.get("idToken") or "").strip()
        if not id_token:
            return self.write_error(HTTPStatus.BAD_REQUEST, "idToken required")
        claims = _verify_google_id_token(id_token)
        google_sub = str(claims.get("sub") or "") if claims else ""
        email = str(claims.get("email") or "").strip().lower() if claims else ""
        if not google_sub or not email:
            return self.write_error(HTTPStatus.UNAUTHORIZED, "Invalid Google token")

        with db() as conn:
            user = conn.execute(
                "SELECT username, role FROM users WHERE google_sub = ?",
                (google_sub,),
            ).fetchone()
            if user is None:
                user = conn.execute(
                    "SELECT username, role FROM users WHERE email = ?",
                    (email,),
                ).fetchone()
                if user is not None:
                    conn.execute(
                        "UPDATE users SET google_sub = ? WHERE username = ?",
                        (google_sub, user["username"]),
                    )
            if user is None:
                existing = conn.execute(
                    "SELECT username FROM users WHERE username = ?",
                    (email,),
                ).fetchone()
                username = email if not existing else f"{email}-{secrets.token_hex(3)}"
                role = "player"
                conn.execute(
                    "INSERT INTO users(username, password_hash, role, google_sub, email)"
                    " VALUES (?, ?, ?, ?, ?)",
                    (username, password_hash(secrets.token_urlsafe(32)), role, google_sub, email),
                )
            else:
                username = user["username"]
                role = user["role"]

            token = secrets.token_urlsafe(32)
            conn.execute(
                "INSERT INTO sessions(token, username, role, expires_at)"
                " VALUES (?, ?, ?, datetime('now', ?))",
                (token, username, role, f"+{SESSION_TTL_SECONDS} seconds"),
            )
            conn.execute(
                "DELETE FROM sessions"
                " WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')",
            )
        return self.write_json({"token": token, "user": {"username": username, "role": role}})

    def _post_password_reset_request(self) -> None:
        # No SMTP in this deployment — a reset request just queues a flag a
        # GM/admin sees and resolves with the existing staff-only "set a
        # player's password" path (POST /api/users). The response is always
        # the same generic message regardless of whether the username exists,
        # so this can't be used to enumerate accounts.
        ip = self.client_address[0]
        if not check_rate(_login_timestamps, ip, *_LOGIN_RATE):
            return self.write_error(HTTPStatus.TOO_MANY_REQUESTS, "Too many attempts")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        username = str(payload.get("username") or "").strip()
        if not username:
            return self.write_error(HTTPStatus.BAD_REQUEST, "'username' is required")
        with db() as conn:
            user = conn.execute("SELECT username FROM users WHERE username = ?", (username,)).fetchone()
            if user:
                conn.execute(
                    "INSERT INTO password_reset_requests(username, requested_at) VALUES (?, datetime('now'))"
                    " ON CONFLICT(username) DO UPDATE SET requested_at = datetime('now')",
                    (username,),
                )
        self.write_json({"ok": True})

    def _get_password_reset_requests(self) -> None:
        session = self.require_gm()
        if not session:
            return None
        with db() as conn:
            rows = conn.execute(
                """
                SELECT r.username, r.requested_at, u.role, u.email
                FROM password_reset_requests r JOIN users u ON u.username = r.username
                ORDER BY r.requested_at ASC
                """,
            ).fetchall()
        self.write_json([
            {"username": row["username"], "requestedAt": row["requested_at"], "role": row["role"], "email": row["email"]}
            for row in rows
        ])

    def _delete_password_reset_request(self, username: str) -> None:
        session = self.require_gm()
        if not session:
            return None
        with db() as conn:
            cur = conn.execute("DELETE FROM password_reset_requests WHERE username = ?", (username,))
        self.write_json({"deleted": cur.rowcount > 0})

    def _post_logout(self) -> None:
        session = self.current_session()
        if session:
            with db() as conn:
                conn.execute("DELETE FROM sessions WHERE token = ?", (session["token"],))
        self.write_json({"ok": True})

    def _post_users_me(self, session: dict[str, str]) -> None:
        # Self-service account edit: email + password change (requires the
        # current password) + a player <-> gm role toggle. Deliberately
        # narrower than the staff-only POST /api/users: no username change,
        # no touching someone else's account, and never a path to 'admin'
        # (that stays an admin-assigned promotion via GM DATA OPS).
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

        with db() as conn:
            user = conn.execute(
                "SELECT username, password_hash, role FROM users WHERE username = ?",
                (session["username"],),
            ).fetchone()
            if not user:
                return self.write_error(HTTPStatus.NOT_FOUND, "User not found")

            updates: dict[str, object] = {}

            if "email" in payload:
                try:
                    email = validate_email(payload, required=False)
                except ValidationError as e:
                    return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
                updates["email"] = email

            if "avatarUrl" in payload:
                updates["avatar_url"] = str(payload.get("avatarUrl") or "").strip()[:500] or None

            new_password = payload.get("newPassword")
            if new_password:
                current_password = payload.get("currentPassword")
                if not isinstance(current_password, str) or not verify_password(current_password, user["password_hash"]):
                    return self.write_error(HTTPStatus.UNAUTHORIZED, "Current password is incorrect")
                if not isinstance(new_password, str) or len(new_password) < 8:
                    return self.write_error(HTTPStatus.BAD_REQUEST, "'newPassword' must be at least 8 characters")
                updates["password_hash"] = password_hash(new_password)

            new_role = payload.get("role")
            if new_role is not None and new_role != user["role"]:
                if user["role"] == "admin":
                    return self.write_error(HTTPStatus.BAD_REQUEST, "Admin role can't be changed here")
                if new_role not in ("player", "gm"):
                    return self.write_error(HTTPStatus.BAD_REQUEST, "'role' must be 'player' or 'gm'")
                updates["role"] = new_role

            if updates:
                set_clause = ", ".join(f"{col} = ?" for col in updates)
                conn.execute(
                    f"UPDATE users SET {set_clause} WHERE username = ?",  # noqa: S608 (column names are our own fixed keys above)
                    (*updates.values(), user["username"]),
                )
                if "role" in updates:
                    # Sync every live session for this account so the role
                    # change is effective immediately, no re-login needed.
                    conn.execute(
                        "UPDATE sessions SET role = ? WHERE username = ?",
                        (updates["role"], user["username"]),
                    )

            row = conn.execute(
                "SELECT username, role, email, avatar_url, created_at FROM users WHERE username = ?",
                (user["username"],),
            ).fetchone()
        self.write_json(self._public_user(row))

    def _get_users(self) -> None:
        session = self.require_gm()
        if not session:
            return None
        with db() as conn:
            rows = conn.execute(
                "SELECT username, role, email, created_at FROM users ORDER BY username",
            ).fetchall()
        self.write_json([self._public_user(row) for row in rows])

    def _post_users(self) -> None:
        # Any staff (gm or admin) can create/reset a player account — this is
        # how a GM gets a player back into their sheet without an email flow
        # (no email is ever sent; the GM sets the password directly and
        # relays it out-of-band). Creating/editing gm or admin accounts stays
        # admin-only to avoid a GM self-escalating or touching other staff.
        session = self.require_gm()
        if not session:
            return None
        is_admin_session = session["role"] == "admin"
        try:
            payload = self.read_json()
            with db() as conn:
                existing_user = conn.execute(
                    "SELECT username, role FROM users WHERE username = ?",
                    (str(payload.get("username") or ""),),
                ).fetchone()
            username, password, role = validate_user(payload, password_optional=bool(existing_user))
            email = validate_email(payload, required=not existing_user)
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

        if not is_admin_session:
            if role != "player" or (existing_user and existing_user["role"] != "player"):
                return self.write_error(HTTPStatus.UNAUTHORIZED, "Only admin can manage gm/admin accounts")

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
                if email:
                    conn.execute("UPDATE users SET email = ? WHERE username = ?", (email, username))
                conn.execute("DELETE FROM sessions WHERE username = ?", (username,))
                if password:
                    conn.execute("DELETE FROM password_reset_requests WHERE username = ?", (username,))
            else:
                if not password:
                    return self.write_error(HTTPStatus.BAD_REQUEST, "Password required")
                conn.execute(
                    "INSERT INTO users(username, password_hash, role, email) VALUES (?, ?, ?, ?)",
                    (username, password_hash(password), role, email),
                )
            row = conn.execute(
                "SELECT username, role, email, created_at FROM users WHERE username = ?",
                (username,),
            ).fetchone()
        self.write_json(self._public_user(row), HTTPStatus.CREATED if not existing else HTTPStatus.OK)

    def _delete_user(self, username: str) -> None:
        session = self.require_gm()
        if not session:
            return None
        if session["role"] != "admin":
            with db() as conn:
                target = conn.execute(
                    "SELECT role FROM users WHERE username = ?",
                    (username,),
                ).fetchone()
            if not target or target["role"] != "player":
                return self.write_error(HTTPStatus.UNAUTHORIZED, "Only admin can delete gm/admin accounts")
        if username == session["username"]:
            return self.write_error(HTTPStatus.BAD_REQUEST, "Admin cannot delete itself")
        with db() as conn:
            conn.execute("DELETE FROM sessions WHERE username = ?", (username,))
            cur = conn.execute("DELETE FROM users WHERE username = ?", (username,))
        self.write_json({"deleted": cur.rowcount > 0})
