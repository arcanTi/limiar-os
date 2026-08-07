"""Ports consumed by application services.

The concrete PostgreSQL adapters live in ``backend.repositories``. Keeping
these protocols here lets use cases run in tests without FastAPI or a database.
"""

from collections.abc import Callable, Mapping
from contextlib import AbstractContextManager
from typing import Protocol

Record = dict[str, object]
Session = Mapping[str, str]


class RecordRepository(Protocol):
    """Persistence port for flexible domain records."""
    def list(self, kind: str) -> list[Record]: ...
    def get(self, kind: str, record_id: str) -> Record | None: ...
    def upsert(self, kind: str, payload: Record) -> Record: ...
    def delete(self, kind: str, record_id: str) -> bool: ...


class SettingRepository(Protocol):
    """Persistence port for campaign-scoped state documents."""
    def get(self, campaign_id: str, key: str) -> object: ...
    def set(self, campaign_id: str, key: str, payload: object) -> object: ...


class ChatRepository(Protocol):
    """Persistence port for one campaign's chat log."""
    def list(self, campaign_id: str) -> list[Record]: ...
    def append(self, campaign_id: str, payload: Record, role: str) -> Record: ...
    def clear(self, campaign_id: str) -> None: ...


class AssetStorage(Protocol):
    """Binary storage port for uploaded assets."""
    def store(self, asset_id: str, suffix: str, content: bytes) -> str: ...


class MetadataRepository(Protocol):
    """Read port for health and reference data."""
    def health(self) -> Record: ...
    def reference(self, name: str) -> object: ...


class SessionUnitOfWork(Protocol):
    """Transaction-scoped session persistence used by authentication transports."""

    def session_by_token(self, token: str) -> Mapping[str, object] | None: ...
    def delete_session(self, token: str) -> None: ...
    def renew_session(self, token: str, expires_at: object) -> None: ...


class SessionRepository(Protocol):
    """Open a transaction for resolving or renewing one session."""

    def transaction(self) -> AbstractContextManager[SessionUnitOfWork]: ...


class CampaignAccessRepository(Protocol):
    """Read campaign existence and membership for application authorization."""

    def get_campaign(self, campaign_id: str) -> Record | None: ...
    def is_campaign_member(self, campaign_id: str, session: dict[str, str]) -> bool: ...


class CampaignEventRepository(Protocol):
    """Persisted campaign event stream consumed by HTTP and WebSocket transports."""

    def subscribe(self, listener: Callable[[Record], None]) -> Callable[[], None]: ...
    def snapshot_since(self, campaign_id: str, since: int) -> Record: ...
    def current_version(self, campaign_id: str) -> int: ...
