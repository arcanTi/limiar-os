"""Native FastAPI campaign, membership and notification routes."""
# ruff: noqa: E501

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from ..application.campaigns import CampaignService
from ..dependencies import campaigns
from .common import Session, json_payload, require_session, require_staff

router = APIRouter(prefix="/api", tags=["campaigns"])
Campaigns = Annotated[CampaignService, Depends(campaigns)]
Authenticated = Annotated[Session, Depends(require_session)]
Staff = Annotated[Session, Depends(require_staff)]
Payload = Annotated[dict[str, object], Depends(json_payload)]


@router.get("/campaigns")
def list_campaigns(session: Authenticated, service: Campaigns) -> list[dict[str, object]]:
    return service.list(session)


@router.get("/notifications")
def notifications(session: Authenticated, service: Campaigns) -> list[dict[str, object]]:
    return service.notifications(session)


@router.post("/campaigns", status_code=201)
def save_campaign(session: Staff, payload: Payload, service: Campaigns) -> JSONResponse:
    return JSONResponse(jsonable_encoder(service.save(payload, session)), status_code=201)


@router.post("/campaigns/{campaign_id}/invite", status_code=201)
def invite(campaign_id: str, session: Staff, payload: Payload, service: Campaigns) -> JSONResponse:
    return JSONResponse(
        jsonable_encoder(
            service.invite(campaign_id, str(payload.get("username") or ""), session)
        ),
        status_code=201,
    )


@router.post("/campaigns/{campaign_id}/join", status_code=201)
def join(campaign_id: str, session: Authenticated, payload: Payload, service: Campaigns) -> JSONResponse:
    return JSONResponse(
        jsonable_encoder(
            service.join(
                campaign_id,
                str(payload.get("characterId") or "").strip(),
                session,
            )
        ),
        status_code=201,
    )


@router.get("/campaigns/{campaign_id}/updates")
def campaign_updates(campaign_id: str, session: Authenticated, service: Campaigns, since: int = 0) -> dict[str, object]:
    return service.updates(campaign_id, since, session)


@router.delete("/campaigns/{campaign_id}/invites/{username}")
def delete_invite(
    campaign_id: str, username: str, session: Staff, service: Campaigns
) -> dict[str, bool]:
    return {"cancelled": service.cancel_invite(campaign_id, username, session)}


@router.delete("/campaigns/{campaign_id}/members/{username}")
def delete_member(
    campaign_id: str, username: str, session: Staff, service: Campaigns
) -> dict[str, bool]:
    return {"removed": service.remove_member(campaign_id, username, session)}
