"""Application composition root used by FastAPI dependencies."""

from functools import lru_cache

from .application.assets import AssetService
from .application.campaign_events import CampaignEventService
from .application.campaign_maps import CampaignMapService
from .application.campaigns import CampaignService
from .application.catalog import CatalogService
from .application.characters import CharacterService
from .application.chat import ChatService
from .application.game_state import GameStateService
from .application.identity import IdentityService
from .application.meta import MetadataService
from .application.sessions import SessionService
from .config import (
    _ALLOWED_IMAGE_TYPES,
    _MAX_UPLOAD_BYTES,
    REMEMBER_SESSION_TTL_SECONDS,
    SESSION_TOUCH_INTERVAL_SECONDS,
    SESSION_TTL_SECONDS,
)
from .repositories import campaign_maps as map_repository
from .repositories import campaign_sync as event_repository
from .repositories import campaigns as campaign_repository
from .repositories.adapters import (
    FilesystemAssetStorage,
    PostgresChatRepository,
    PostgresRecordRepository,
    PostgresSettingRepository,
)
from .repositories.identity import PostgresIdentityRepository
from .repositories.meta import PostgresMetadataRepository
from .security import password_hash, verify_password


@lru_cache
def records() -> PostgresRecordRepository:
    return PostgresRecordRepository()


@lru_cache
def settings() -> PostgresSettingRepository:
    return PostgresSettingRepository()


@lru_cache
def characters() -> CharacterService:
    return CharacterService(records())


@lru_cache
def catalog() -> CatalogService:
    return CatalogService(records())


@lru_cache
def chat() -> ChatService:
    return ChatService(PostgresChatRepository(), campaign_repository)


@lru_cache
def game_state() -> GameStateService:
    return GameStateService(settings(), records(), campaign_repository)


@lru_cache
def assets() -> AssetService:
    return AssetService(
        records(),
        FilesystemAssetStorage(),
        dict(_ALLOWED_IMAGE_TYPES),
        _MAX_UPLOAD_BYTES,
    )


@lru_cache
def identity_repository() -> PostgresIdentityRepository:
    return PostgresIdentityRepository()


@lru_cache
def identity() -> IdentityService:
    return IdentityService(
        identity_repository(),
        password_hash,
        verify_password,
        SESSION_TTL_SECONDS,
        REMEMBER_SESSION_TTL_SECONDS,
    )


@lru_cache
def sessions() -> SessionService:
    return SessionService(
        identity_repository(),
        SESSION_TTL_SECONDS,
        REMEMBER_SESSION_TTL_SECONDS,
        SESSION_TOUCH_INTERVAL_SECONDS,
    )


@lru_cache
def campaign_events() -> CampaignEventService:
    return CampaignEventService(sessions(), campaign_repository, event_repository)


@lru_cache
def campaign_maps() -> CampaignMapService:
    return CampaignMapService(map_repository, campaign_repository)


@lru_cache
def metadata() -> MetadataService:
    return MetadataService(PostgresMetadataRepository())


@lru_cache
def campaigns() -> CampaignService:
    return CampaignService(campaign_repository, records(), event_repository)
