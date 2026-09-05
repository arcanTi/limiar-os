"""Identity, access-token, session, and account-management use cases."""

import secrets
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from ..domain.validation import ValidationError, validate_email, validate_login, validate_user
from .errors import ApplicationError
from .ports import Session

TokenFactory = Callable[[], str]
# A fresh token is drawn until it is free. Six characters over a 31-symbol
# alphabet leave ~887M combinations, so even a large table collides rarely;
# the bound only guarantees the loop terminates.
_TOKEN_ATTEMPTS = 12


def _public_user(row: Mapping[str, object]) -> dict[str, object]:
    return {
        "username": row["username"],
        "role": row["role"],
        "email": row.get("email"),
        "avatarUrl": row.get("avatar_url"),
        "accessToken": row.get("access_token"),
        "createdAt": row["created_at"],
    }


class IdentityService:
    """Coordinate identity rules through a transaction-scoped repository."""

    def __init__(
        self,
        repository: Any,  # noqa: ANN401
        generate_access_token: TokenFactory,
        session_ttl_seconds: int,
        remember_session_ttl_seconds: int,
    ) -> None:
        self._repository = repository
        self._generate_access_token = generate_access_token
        self._session_ttl_seconds = session_ttl_seconds
        self._remember_session_ttl_seconds = remember_session_ttl_seconds

    @staticmethod
    def _expiry(seconds: int) -> datetime:
        return datetime.now(UTC) + timedelta(seconds=seconds)

    def _free_access_token(self, identity: Any) -> str:  # noqa: ANN401
        for _ in range(_TOKEN_ATTEMPTS):
            candidate = self._generate_access_token()
            if not identity.access_token_exists(candidate):
                return candidate
        raise ApplicationError(503, "Could not allocate a free access token")

    def login(self, payload: Mapping[str, object]) -> dict[str, object]:
        try:
            access_token = validate_login(dict(payload))
        except ValidationError as exc:
            raise ApplicationError(400, str(exc), "VALIDATION_ERROR") from exc
        remember = bool(payload.get("remember"))
        with self._repository.transaction() as identity:
            user = identity.user_by_access_token(access_token)
            if not user:
                raise ApplicationError(401, "Invalid access token")
            token = secrets.token_urlsafe(32)
            ttl = self._remember_session_ttl_seconds if remember else self._session_ttl_seconds
            identity.create_session(
                token,
                str(user["username"]),
                str(user["role"]),
                self._expiry(ttl),
                remember,
            )
            identity.delete_expired_sessions(self._expiry(0))
        return {
            "token": token,
            "user": {"username": user["username"], "role": user["role"]},
        }

    def logout(self, session: Session | None) -> dict[str, bool]:
        if session:
            with self._repository.transaction() as identity:
                identity.delete_session(session["token"])
        return {"ok": True}

    def users(self) -> list[dict[str, object]]:
        with self._repository.transaction() as identity:
            return [_public_user(row) for row in identity.list_users()]

    def update_me(self, session: Session, payload: Mapping[str, object]) -> dict[str, object]:
        with self._repository.transaction() as identity:
            user = identity.user_by_username(session["username"])
            if not user:
                raise ApplicationError(404, "User not found")
            updates: dict[str, object] = {}
            if "email" in payload:
                try:
                    updates["email"] = validate_email(dict(payload), required=False)
                except ValidationError as exc:
                    raise ApplicationError(400, str(exc), "VALIDATION_ERROR") from exc
            if "avatarUrl" in payload:
                updates["avatar_url"] = str(payload.get("avatarUrl") or "").strip()[:500] or None
            new_role = payload.get("role")
            if new_role is not None and new_role != user["role"]:
                if user["role"] == "admin":
                    raise ApplicationError(400, "Admin role can't be changed here")
                if new_role not in {"player", "gm"}:
                    raise ApplicationError(400, "'role' must be 'player' or 'gm'")
                updates["role"] = new_role
            identity.update_profile(str(user["username"]), updates)
            row = identity.public_user(str(user["username"]))
        return _public_user(row or {})

    def upsert_user(
        self,
        session: Session,
        payload: Mapping[str, object],
    ) -> tuple[dict[str, object], bool]:
        requested_username = str(payload.get("username") or "")
        with self._repository.transaction() as identity:
            existing_user = identity.user_by_username(requested_username)
            try:
                username, role = validate_user(dict(payload))
                email = validate_email(dict(payload), required=False)
            except ValidationError as exc:
                raise ApplicationError(400, str(exc), "VALIDATION_ERROR") from exc
            if session["role"] != "admin" and (
                role != "player" or (existing_user and existing_user["role"] != "player")
            ):
                raise ApplicationError(401, "Only admin can manage gm/admin accounts")
            created = existing_user is None
            if existing_user:
                if username == session["username"] and role != "admin":
                    raise ApplicationError(400, "Admin cannot demote itself")
                identity.update_managed_user(username, role, email)
            else:
                identity.create_user(
                    username,
                    self._free_access_token(identity),
                    role,
                    email,
                )
            row = identity.public_user(username)
        return _public_user(row or {}), created

    def regenerate_access_token(self, username: str, session: Session) -> dict[str, object]:
        """Issue a new token for `username`, invalidating the previous one."""
        with self._repository.transaction() as identity:
            target = identity.user_by_username(username)
            if not target:
                raise ApplicationError(404, "User not found")
            if session["role"] != "admin" and target["role"] != "player":
                raise ApplicationError(401, "Only admin can manage gm/admin accounts")
            identity.replace_access_token(username, self._free_access_token(identity))
            row = identity.public_user(username)
        return _public_user(row or {})

    def delete_user(self, username: str, session: Session) -> bool:
        with self._repository.transaction() as identity:
            if session["role"] != "admin":
                target = identity.user_by_username(username)
                if not target or target["role"] != "player":
                    raise ApplicationError(401, "Only admin can delete gm/admin accounts")
            if username == session["username"]:
                raise ApplicationError(400, "Admin cannot delete itself")
            return identity.delete_user(username)
