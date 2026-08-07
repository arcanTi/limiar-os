"""Concrete PostgreSQL adapters for application ports."""

from ..config import UPLOAD_DIR
from .chat import append_chat, clear_chat, list_chat
from .records import (
    delete_record,
    get_campaign_setting,
    get_record,
    list_records,
    set_campaign_setting,
    upsert_record,
)


class PostgresRecordRepository:
    """Adapter over the PostgreSQL record functions."""
    list = staticmethod(list_records)
    get = staticmethod(get_record)
    upsert = staticmethod(upsert_record)
    delete = staticmethod(delete_record)


class PostgresSettingRepository:
    """Adapter over campaign-scoped PostgreSQL settings."""
    get = staticmethod(get_campaign_setting)
    set = staticmethod(set_campaign_setting)


class PostgresChatRepository:
    """Adapter over PostgreSQL chat storage."""
    list = staticmethod(list_chat)
    append = staticmethod(append_chat)
    clear = staticmethod(clear_chat)


class FilesystemAssetStorage:
    """Store validated asset bytes in the configured upload directory."""
    def store(self, asset_id: str, suffix: str, content: bytes) -> str:
        target = UPLOAD_DIR / f"{asset_id}{suffix}"
        target.write_bytes(content)
        return f"/uploads/{target.name}"
