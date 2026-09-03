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

    def user_by_access_token(self, access_token: str) -> Mapping[str, object] | None:
        return self._connection.execute(
            "SELECT username, role FROM users WHERE access_token = %s",
            (access_token,),
        ).fetchone()

    def user_by_username(self, username: str) -> Mapping[str, object] | None:
        return self._connection.execute(
            "SELECT username, role FROM users WHERE username = %s",
            (username,),
        ).fetchone()

    def public_user(self, username: str) -> Mapping[str, object] | None:
        return self._connection.execute(
            "SELECT username, role, email, avatar_url, access_token, created_at "
            "FROM users WHERE username = %s",
            (username,),
        ).fetchone()

    def access_token_exists(self, access_token: str) -> bool:
        return bool(
            self._connection.execute(
                "SELECT 1 FROM users WHERE access_token = %s",
                (access_token,),
            ).fetchone()
        )

    def create_user(
        self,
        username: str,
        access_token: str,
        role: str,
        email: str | None = None,
    ) -> None:
        self._connection.execute(
            "INSERT INTO users(username, access_token, role, email) VALUES (%s, %s, %s, %s)",
            (username, access_token, role, email),
        )

    def replace_access_token(self, username: str, access_token: str) -> None:
        """Rotate a token and drop every session it had opened."""
        self._connection.execute(
            "UPDATE users SET access_token = %s WHERE username = %s",
            (access_token, username),
        )
        self._connection.execute("DELETE FROM sessions WHERE username = %s", (username,))

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

    def list_users(self) -> list[Mapping[str, object]]:
        return self._connection.execute(
            "SELECT username, role, email, avatar_url, access_token, created_at "
            "FROM users ORDER BY username"
        ).fetchall()

    def update_profile(self, username: str, updates: Mapping[str, object]) -> None:
        allowed = {"email", "avatar_url", "role"}
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

    def update_managed_user(self, username: str, role: str, email: str | None) -> None:
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

    def delete_user(self, username: str) -> bool:
        for table in ("sessions", "campaign_members", "campaign_invites"):
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
