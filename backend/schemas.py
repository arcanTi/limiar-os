"""Pydantic transport contracts for the public HTTP API."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Document(BaseModel):
    """Version-tolerant document used while sheet fields are normalized."""

    model_config = ConfigDict(extra="allow")

    id: str | None = None

    def payload(self) -> dict[str, object]:
        return self.model_dump(exclude_none=True)


class EndTurnRequest(BaseModel):
    """Command selecting the combatant whose turn ends."""

    target_id: str = Field(alias="targetId", min_length=1, max_length=200)
    expected_revision: int = Field(alias="expectedRevision", ge=0)


class ErrorBody(BaseModel):
    """Stable application error body."""
    code: str
    message: str


class ErrorResponse(BaseModel):
    """Stable application error envelope."""
    error: ErrorBody


class HealthDatabase(BaseModel):
    """Database details returned by the health endpoint."""

    model_config = ConfigDict(populate_by_name=True)
    engine: str
    name: str
    bytes: int
    sqlite_import_supported: bool = Field(alias="sqliteImportSupported")


class HealthResponse(BaseModel):
    """Operational health contract."""
    ok: bool
    database: HealthDatabase


class LoginArtResponse(BaseModel):
    """Login hero-image contract."""
    images: list[str]


JsonObject = dict[str, Any]
