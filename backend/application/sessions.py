"""Session resolution and throttled sliding-expiration use cases."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from .ports import SessionRepository


class SessionService:
    """Resolve one bearer token consistently for every transport."""

    def __init__(
        self,
        repository: SessionRepository,
        session_ttl_seconds: int,
        remember_session_ttl_seconds: int,
        touch_interval_seconds: int,
        *,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._repository = repository
        self._session_ttl_seconds = session_ttl_seconds
        self._remember_session_ttl_seconds = remember_session_ttl_seconds
        self._touch_interval_seconds = touch_interval_seconds
        self._clock = clock or _utc_now

    @staticmethod
    def _as_utc(value: object) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            parsed = value
        else:
            try:
                parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except ValueError:
                return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)

    def resolve(
        self,
        token: str,
        *,
        touch: bool = True,
        now: datetime | None = None,
    ) -> dict[str, str] | None:
        token = token.strip()
        if not token:
            return None
        resolved_at = now or self._clock()
        with self._repository.transaction() as identity:
            row = identity.session_by_token(token)
            if not row:
                return None
            expires_at = self._as_utc(row["expires_at"])
            if expires_at is not None and expires_at <= resolved_at:
                identity.delete_session(token)
                return None
            ttl = (
                self._remember_session_ttl_seconds
                if row["remember"]
                else self._session_ttl_seconds
            )
            touch_interval = min(
                max(1, self._touch_interval_seconds),
                max(1, ttl // 2),
            )
            renewal_cutoff = resolved_at + timedelta(
                seconds=max(0, ttl - touch_interval)
            )
            if touch and (expires_at is None or expires_at <= renewal_cutoff):
                identity.renew_session(token, resolved_at + timedelta(seconds=ttl))
        return {
            "token": str(row["token"]),
            "username": str(row["username"]),
            "role": str(row["role"]),
            "avatarUrl": row["avatar_url"],
        }


def _utc_now() -> datetime:
    return datetime.now(UTC)
