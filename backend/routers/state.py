"""Native FastAPI shared game-state endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends

from ..application.game_state import GameStateService
from ..dependencies import game_state
from ..schemas import Document, EndTurnRequest
from .common import Session, require_session, require_staff

router = APIRouter(prefix="/api", tags=["state"])
State = Annotated[GameStateService, Depends(game_state)]
Authenticated = Annotated[Session, Depends(require_session)]
Staff = Annotated[Session, Depends(require_staff)]


@router.get("/nexus-challenge")
def nexus_challenge(_session: Authenticated, service: State) -> object:
    return service.get("nexusChallenge")


@router.get("/nexus-result")
def nexus_result(_session: Authenticated, service: State) -> object:
    return service.get("nexusResult")


@router.post("/nexus-result")
def report_nexus(payload: Document, _session: Authenticated, service: State) -> object:
    return service.report_nexus(payload.payload())


@router.post("/nexus-challenge")
def set_nexus(payload: Document, _session: Staff, service: State) -> object:
    return service.set_nexus(payload.payload())


@router.get("/hq")
def hq(_session: Authenticated, service: State) -> object:
    return service.get("hqIp", {"ip": 0, "log": []})


@router.post("/hq")
def set_hq(payload: Document, _session: Staff, service: State) -> object:
    return service.set_hq(payload.payload())


@router.get("/tarot-state")
def tarot(_session: Authenticated, service: State) -> object:
    return service.get("tarot-state")


@router.post("/tarot-state")
def set_tarot(payload: Document, _session: Staff, service: State) -> object:
    return service.set_tarot(payload.payload())


@router.get("/combat-state")
def combat(_session: Authenticated, service: State) -> object:
    return service.get("combat-state")


@router.post("/combat-state")
def set_combat(payload: Document, _session: Staff, service: State) -> object:
    return service.set_combat(payload.payload())


@router.post("/combat-state/end-turn")
def end_turn(payload: EndTurnRequest, session: Authenticated, service: State) -> object:
    return service.end_turn(payload.target_id, session)
