"""Identity, credential, session, and account-management use cases."""

import secrets
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from ..domain.validation import ValidationError, validate_email, validate_login, validate_user
from .errors import ApplicationError
from .ports import Session

PasswordHasher = Callable[[str], str]
PasswordVerifier = Callable[[str, str], bool]


def _public_user(row: Mapping[str, object]) -> dict[str, object]:
    return {
        "username": row["username"],
        "role": row["role"],
        "email": row.get("email"),
        "avatarUrl": row.get("avatar_url"),
        "createdAt": row["created_at"],
    }


class IdentityService:
    """Coordinate identity rules through a transaction-scoped repository."""

    def __init__(
        self,
        repository: Any,  # noqa: ANN401
        hash_password: PasswordHasher,
        verify_password: PasswordVerifier,
        session_ttl_seconds: int,
        remember_session_ttl_seconds: int,
    ) -> None:
        self._repository = repository
        self._hash_password = hash_password
        self._verify_password = verify_password
        self._session_ttl_seconds = session_ttl_seconds
        self._remember_session_ttl_seconds = remember_session_ttl_seconds

    @staticmethod
    def _expiry(seconds: int) -> datetime:
        return datetime.now(UTC) + timedelta(seconds=seconds)

    def login(self, payload: Mapping[str, object]) -> dict[str, object]:
        try:
            username, password = validate_login(dict(payload))
        except ValidationError as exc:
            raise ApplicationError(400, str(exc), "VALIDATION_ERROR") from exc
        remember = bool(payload.get("remember"))
        with self._repository.transaction() as identity:
            user = identity.user_for_login(username)
            if not user or not self._verify_password(password, str(user["password_hash"])):
                raise ApplicationError(401, "Invalid credentials")
            if not str(user["password_hash"]).startswith("pbkdf2:"):
                identity.replace_password(str(user["username"]), self._hash_password(password))
            token = secrets.token_urlsafe(32)
            ttl = (
                self._remember_session_ttl_seconds if remember else self._session_ttl_seconds
            )
            identity.create_session(
                token,
                str(user["username"]),
                str(user["role"]),
                self._expiry(ttl),
                remember,
            )
            identity.delete_expired_sessions(self._expiry(0))
        return {"token": token, "user": {"username": username, "role": user["role"]}}

    def register(self, payload: Mapping[str, object]) -> dict[str, object]:
        try:
            username, password, _role = validate_user({**payload, "role": "player"})
        except ValidationError as exc:
            raise ApplicationError(400, str(exc), "VALIDATION_ERROR") from exc
        with self._repository.transaction() as identity:
            if identity.username_exists(username):
                raise ApplicationError(409, "User already exists")
            identity.create_user(username, self._hash_password(password), "player")
            token = secrets.token_urlsafe(32)
            identity.create_session(
                token,
                username,
                "player",
                self._expiry(self._session_ttl_seconds),
            )
        return {"token": token, "user": {"username": username, "role": "player"}}

    def google_login(self, claims: Mapping[str, object] | None) -> dict[str, object]:
        google_sub = str(claims.get("sub") or "") if claims else ""
        email = str(claims.get("email") or "").strip().lower() if claims else ""
        if not google_sub or not email:
            raise ApplicationError(401, "Invalid Google token")
        with self._repository.transaction() as identity:
            user = identity.user_by_google_sub(google_sub)
            if user is None:
                user = identity.user_by_email(email)
                if user is not None:
                    identity.link_google_identity(str(user["username"]), google_sub)
            if user is None:
                username = (
                    email
                    if not identity.username_exists(email)
                    else f"{email}-{secrets.token_hex(3)}"
                )
                role = "player"
                identity.create_user(
                    username,
                    self._hash_password(secrets.token_urlsafe(32)),
                    role,
                    email,
                    google_sub,
                )
            else:
                username, role = str(user["username"]), str(user["role"])
            token = secrets.token_urlsafe(32)
            identity.create_session(
                token,
                username,
                role,
                self._expiry(self._session_ttl_seconds),
            )
            identity.delete_expired_sessions(self._expiry(0))
        return {"token": token, "user": {"username": username, "role": role}}

    def request_password_reset(self, username: str) -> dict[str, bool]:
        username = username.strip()
        if not username:
            raise ApplicationError(400, "'username' is required")
        with self._repository.transaction() as identity:
            identity.request_password_reset(username)
        return {"ok": True}

    def logout(self, session: Session | None) -> dict[str, bool]:
        if session:
            with self._repository.transaction() as identity:
                identity.delete_session(session["token"])
        return {"ok": True}

    def password_reset_requests(self) -> list[dict[str, object]]:
        with self._repository.transaction() as identity:
            rows = identity.list_password_reset_requests()
        return [
            {
                "username": row["username"],
                "requestedAt": row["requested_at"],
                "role": row["role"],
                "email": row["email"],
            }
            for row in rows
        ]

    def delete_password_reset_request(self, username: str) -> bool:
        with self._repository.transaction() as identity:
            return identity.delete_password_reset_request(username)

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
            if payload.get("newPassword"):
                current_password = payload.get("currentPassword")
                if not isinstance(current_password, str) or not self._verify_password(
                    current_password,
                    str(user["password_hash"]),
                ):
                    raise ApplicationError(401, "Current password is incorrect")
                new_password = payload["newPassword"]
                if not isinstance(new_password, str) or len(new_password) < 8:
                    raise ApplicationError(400, "'newPassword' must be at least 8 characters")
                updates["password_hash"] = self._hash_password(new_password)
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
                username, password, role = validate_user(
                    dict(payload),
                    password_optional=bool(existing_user),
                )
                email = validate_email(dict(payload), required=not existing_user)
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
                identity.update_managed_user(
                    username,
                    role,
                    self._hash_password(password) if password else None,
                    email,
                )
            else:
                if not password:
                    raise ApplicationError(400, "Password required")
                identity.create_user(username, self._hash_password(password), role, email)
            row = identity.public_user(username)
        return _public_user(row or {}), created

    def delete_user(self, username: str, session: Session) -> bool:
        with self._repository.transaction() as identity:
            if session["role"] != "admin":
                target = identity.user_by_username(username)
                if not target or target["role"] != "player":
                    raise ApplicationError(401, "Only admin can delete gm/admin accounts")
            if username == session["username"]:
                raise ApplicationError(400, "Admin cannot delete itself")
            return identity.delete_user(username)
