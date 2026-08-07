"""Validated image persistence use case."""

import secrets

from ..util import slug
from .errors import ApplicationError
from .ports import AssetStorage, Record, RecordRepository


class AssetService:
    """Validate and persist uploaded image assets through injected ports."""
    def __init__(
        self,
        records: RecordRepository,
        storage: AssetStorage,
        allowed_types: dict[str, str],
        max_bytes: int,
    ) -> None:
        self.records = records
        self.storage = storage
        self.allowed_types = allowed_types
        self.max_bytes = max_bytes

    def save_image(self, *, content: bytes, mime: str, filename: str, meta: Record) -> Record:
        if not content:
            raise ApplicationError(400, "file required")
        if len(content) > self.max_bytes:
            raise ApplicationError(
                413, f"File too large (max {self.max_bytes // (1024 * 1024)} MB)"
            )
        normalized_mime = mime.lower().split(";", 1)[0].strip()
        suffix = self.allowed_types.get(normalized_mime)
        if suffix is None:
            allowed = ", ".join(self.allowed_types)
            raise ApplicationError(
                415, f"Unsupported file type '{normalized_mime}'. Allowed: {allowed}"
            )
        asset_id = f"{slug(meta.get('scope') or 'asset')}-{secrets.token_hex(8)}"
        url = self.storage.store(asset_id, suffix, content)
        asset: Record = {
            "id": asset_id,
            "name": filename,
            "scope": meta.get("scope") or "asset",
            "ownerId": meta.get("ownerId"),
            "type": normalized_mime,
            "url": url,
        }
        return self.records.upsert("assets", asset)
