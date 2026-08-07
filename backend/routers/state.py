"""Native FastAPI shared game-state endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends

from ..application.game_state import GameStateService
from ..dependencies import game_state
from ..schemas import Document, EndTurnRequest
from .common import Session, require_session, require_staff

router = APIRouter(prefix="/api/campaigns/{campaign_id}", tags=["state"])
State = Annotated[GameStateService, Depends(game_state)]
Authenticated = Annotated[Session, Depends(require_session)]
Staff = Annotated[Session, Depends(require_staff)]


@router.get("/nexus-challenge")
def nexus_challenge(campaign_id: str, session: Authenticated, service: State) -> object:
    return service.get(campaign_id, "nexusChallenge", session)


@router.get("/nexus-result")
def nexus_result(campaign_id: str, session: Authenticated, service: State) -> object:
    return service.get(campaign_id, "nexusResult", session)


@router.post("/nexus-result")
def report_nexus(
    campaign_id: str, payload: Document, session: Authenticated, service: State
) -> object:
    return service.report_nexus(campaign_id, payload.payload(), session)


@router.post("/nexus-challenge")
def set_nexus(campaign_id: str, payload: Document, session: Staff, service: State) -> object:
    return service.set_nexus(campaign_id, payload.payload(), session)


@router.get("/hq")
def hq(campaign_id: str, session: Authenticated, service: State) -> object:
    return service.get(campaign_id, "hqIp", session, {"ip": 0, "log": []})


@router.post("/hq")
def set_hq(campaign_id: str, payload: Document, session: Staff, service: State) -> object:
    return service.set_hq(campaign_id, payload.payload(), session)


@router.get("/tarot-state")
def tarot(campaign_id: str, session: Authenticated, service: State) -> object:
    return service.get(campaign_id, "tarot-state", session)


@router.post("/tarot-state")
def set_tarot(campaign_id: str, payload: Document, session: Staff, service: State) -> object:
    return service.set_tarot(campaign_id, payload.payload(), session)


@router.get("/combat-state")
def combat(campaign_id: str, session: Authenticated, service: State) -> object:
    return service.get(campaign_id, "combat-state", session)


@router.post("/combat-state")
def set_combat(campaign_id: str, payload: Document, session: Staff, service: State) -> object:
    return service.set_combat(campaign_id, payload.payload(), session)


@router.post("/combat-state/end-turn")
def end_turn(
    campaign_id: str, payload: EndTurnRequest, session: Authenticated, service: State
) -> object:
    return service.end_turn(campaign_id, payload.target_id, payload.expected_revision, session)
