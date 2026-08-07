"""Catalog commands and queries."""

from collections.abc import Callable
from typing import ClassVar

from ..domain.validation import validate_item, validate_map_location
from .ports import Record, RecordRepository


class CatalogService:
    """Validate catalog writes before invoking the record port."""

    _VALIDATORS: ClassVar[dict[str, Callable[[Record], None]]] = {
        "items": validate_item,
        "map": validate_map_location,
    }

    def __init__(self, records: RecordRepository) -> None:
        self.records = records

    def list(self, kind: str) -> list[Record]:
        return self.records.list(kind)

    def save(self, kind: str, payload: Record) -> Record:
        self._VALIDATORS[kind](payload)
        return self.records.upsert(kind, payload)

    def delete(self, kind: str, record_id: str) -> bool:
        return self.records.delete(kind, record_id)
