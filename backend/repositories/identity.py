"""PostgreSQL unit of work for identities, credentials, and sessions."""

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from datetime import datetime
from typing import Any

from ..db import db


class PostgresIdentityUnitOfWork:
    """Expose identity persistence without leaking SQL into use cases."""

    def __init__(self, connection: Any) -> None:  # noqa: ANN401
        self._connection = connection

    def user_for_login(self, username: str) -> Mapping[str, object] | None:
        return self._connection.execute(
            "SELECT username, password_hash, role FROM users WHERE username = %s",
            (username,),
        ).fetchone()

    def user_by_username(self, username: str) -> Mapping[str, object] | None:
        return self._connection.execute(
            "SELECT username, password_hash, role FROM users WHERE username = %s",
            (username,),
        ).fetchone()

    def public_user(self, username: str) -> Mapping[str, object] | None:
        return self._connection.execute(
            "SELECT username, role, email, avatar_url, created_at "
            "FROM users WHERE username = %s",
            (username,),
        ).fetchone()

    def user_by_google_sub(self, google_sub: str) -> Mapping[str, object] | None:
        return self._connection.execute(
            "SELECT username, role FROM users WHERE google_sub = %s",
            (google_sub,),
        ).fetchone()

    def user_by_email(self, email: str) -> Mapping[str, object] | None:
        return self._connection.execute(
            "SELECT username, role FROM users WHERE email = %s",
            (email,),
        ).fetchone()

    def username_exists(self, username: str) -> bool:
        return bool(
            self._connection.execute(
                "SELECT 1 FROM users WHERE username = %s",
                (username,),
            ).fetchone()
        )

    def create_user(
        self,
        username: str,
        password_hash: str,
        role: str,
        email: str | None = None,
        google_sub: str | None = None,
    ) -> None:
        self._connection.execute(
            "INSERT INTO users(username, password_hash, role, google_sub, email) "
            "VALUES (%s, %s, %s, %s, %s)",
            (username, password_hash, role, google_sub, email),
        )

    def link_google_identity(self, username: str, google_sub: str) -> None:
        self._connection.execute(
            "UPDATE users SET google_sub = %s WHERE username = %s",
            (google_sub, username),
        )

    def replace_password(self, username: str, password_hash: str) -> None:
        self._connection.execute(
            "UPDATE users SET password_hash = %s WHERE username = %s",
            (password_hash, username),
        )

    def create_session(
        self,
        token: str,
        username: str,
        role: str,
        expires_at: datetime,
        remember: bool = False,
    ) -> None:
        self._connection.execute(
            "INSERT INTO sessions(token, username, role, expires_at, remember) "
            "VALUES (%s, %s, %s, %s, %s)",
            (token, username, role, expires_at, int(remember)),
        )

    def session_by_token(self, token: str) -> Mapping[str, object] | None:
        return self._connection.execute(
            """
            SELECT s.token, s.username, s.role, s.expires_at, s.remember, u.avatar_url
            FROM sessions s JOIN users u ON u.username = s.username
            WHERE s.token = %s
            """,
            (token,),
        ).fetchone()

    def renew_session(self, token: str, expires_at: object) -> None:
        self._connection.execute(
            "UPDATE sessions SET expires_at = %s WHERE token = %s",
            (expires_at, token),
        )

    def delete_expired_sessions(self, now: datetime) -> None:
        self._connection.execute(
            "DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= %s",
            (now,),
        )

    def delete_session(self, token: str) -> None:
        self._connection.execute("DELETE FROM sessions WHERE token = %s", (token,))

    def request_password_reset(self, username: str) -> None:
        if not self.username_exists(username):
            return
        self._connection.execute(
            "INSERT INTO password_reset_requests(username, requested_at) "
            "VALUES (%s, CURRENT_TIMESTAMP) "
            "ON CONFLICT(username) DO UPDATE SET requested_at = CURRENT_TIMESTAMP",
            (username,),
        )

    def list_password_reset_requests(self) -> list[Mapping[str, object]]:
        return self._connection.execute(
            """
            SELECT r.username, r.requested_at, u.role, u.email
            FROM password_reset_requests r JOIN users u ON u.username = r.username
            ORDER BY r.requested_at ASC
            """
        ).fetchall()

    def delete_password_reset_request(self, username: str) -> bool:
        cursor = self._connection.execute(
            "DELETE FROM password_reset_requests WHERE username = %s",
            (username,),
        )
        return cursor.rowcount > 0

    def list_users(self) -> list[Mapping[str, object]]:
        return self._connection.execute(
            "SELECT username, role, email, avatar_url, created_at "
            "FROM users ORDER BY username"
        ).fetchall()

    def update_profile(self, username: str, updates: Mapping[str, object]) -> None:
        allowed = {"email", "avatar_url", "password_hash", "role"}
        safe_updates = {key: value for key, value in updates.items() if key in allowed}
        if not safe_updates:
            return
        set_clause = ", ".join(f"{column} = %s" for column in safe_updates)
        self._connection.execute(
            f"UPDATE users SET {set_clause} WHERE username = %s",  # noqa: S608
            (*safe_updates.values(), username),
        )
        if "role" in safe_updates:
            self._connection.execute(
                "UPDATE sessions SET role = %s WHERE username = %s",
                (safe_updates["role"], username),
            )

    def update_managed_user(
        self,
        username: str,
        role: str,
        password_hash: str | None,
        email: str | None,
    ) -> None:
        if password_hash:
            self._connection.execute(
                "UPDATE users SET password_hash = %s, role = %s WHERE username = %s",
                (password_hash, role, username),
            )
        else:
            self._connection.execute(
                "UPDATE users SET role = %s WHERE username = %s",
                (role, username),
            )
        if email:
            self._connection.execute(
                "UPDATE users SET email = %s WHERE username = %s",
                (email, username),
            )
        self._connection.execute("DELETE FROM sessions WHERE username = %s", (username,))
        if password_hash:
            self._connection.execute(
                "DELETE FROM password_reset_requests WHERE username = %s",
                (username,),
            )

    def delete_user(self, username: str) -> bool:
        for table in (
            "sessions",
            "campaign_members",
            "campaign_invites",
            "password_reset_requests",
        ):
            self._connection.execute(
                f"DELETE FROM {table} WHERE username = %s",  # noqa: S608
                (username,),
            )
        cursor = self._connection.execute("DELETE FROM users WHERE username = %s", (username,))
        return cursor.rowcount > 0


class PostgresIdentityRepository:
    """Create one transaction-scoped identity unit of work per use case."""

    @contextmanager
    def transaction(self) -> Iterator[PostgresIdentityUnitOfWork]:
        with db() as connection:
            yield PostgresIdentityUnitOfWork(connection)
