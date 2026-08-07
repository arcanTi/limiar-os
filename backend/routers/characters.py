"""Native FastAPI character endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends

from ..application.characters import CharacterService
from ..dependencies import characters
from ..schemas import Document
from .common import Session, require_session, require_staff

router = APIRouter(prefix="/api", tags=["characters"])
Characters = Annotated[CharacterService, Depends(characters)]
Authenticated = Annotated[Session, Depends(require_session)]
Staff = Annotated[Session, Depends(require_staff)]


@router.get("/characters")
def list_characters(session: Authenticated, service: Characters) -> list[dict[str, object]]:
    return service.list(session)


@router.get("/characters/{record_id}")
def get_character(record_id: str, session: Authenticated, service: Characters) -> dict[str, object]:
    return service.get(record_id, session)


@router.post("/characters")
def save_character(payload: Document, session: Staff, service: Characters) -> dict[str, object]:
    return service.save_as_staff(payload.payload(), session)


@router.post("/player-characters", status_code=201)
def save_player_character(
    payload: Document, session: Authenticated, service: Characters
) -> dict[str, object]:
    return service.save_as_player(payload.payload(), session)


@router.post("/characters/{record_id}/notes")
def patch_character_notes(
    record_id: str, payload: Document, session: Authenticated, service: Characters
) -> dict[str, object]:
    return service.patch_notes(record_id, payload.payload(), session)


@router.delete("/characters/{record_id}")
def delete_character(record_id: str, _session: Staff, service: Characters) -> dict[str, bool]:
    return {"deleted": service.delete(record_id)}
