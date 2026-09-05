"""FastAPI boundary for authentication and access-token management."""
# ruff: noqa: ANN201

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from ..application.campaigns import CampaignService
from ..application.errors import ApplicationError
from ..application.identity import IdentityService
from ..config import _LOGIN_GLOBAL_RATE, _LOGIN_RATE
from ..dependencies import campaigns, identity
from ..security import _login_timestamps, check_rate
from .common import Session, json_payload, optional_session, require_session, require_staff

router = APIRouter(prefix="/api", tags=["auth"])
Identity = Annotated[IdentityService, Depends(identity)]
Campaigns = Annotated[CampaignService, Depends(campaigns)]
Payload = Annotated[dict[str, object], Depends(json_payload)]
Authenticated = Annotated[Session, Depends(require_session)]
Staff = Annotated[Session, Depends(require_staff)]

# Key of the deployment-wide guess budget. It shares the per-IP store so a
# single sweep expires both windows together.
_GLOBAL_RATE_KEY = "*"


def _rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "127.0.0.1"
    if not check_rate(_login_timestamps, ip, *_LOGIN_RATE):
        raise ApplicationError(429, "Too many login attempts")
    if not check_rate(_login_timestamps, _GLOBAL_RATE_KEY, *_LOGIN_GLOBAL_RATE):
        raise ApplicationError(429, "Too many login attempts")


@router.get("/session")
def session_status(
    session: Annotated[Session | None, Depends(optional_session)],
) -> dict[str, object]:
    return {"authenticated": bool(session), "user": session}


@router.post("/login")
def login(request: Request, payload: Payload, service: Identity):
    _rate_limit(request)
    return service.login(payload)


@router.post("/logout")
def logout(
    session: Annotated[Session | None, Depends(optional_session)],
    service: Identity,
) -> dict[str, bool]:
    return service.logout(session)


@router.get("/users")
def users(_session: Staff, service: Identity):
    return service.users()


@router.post("/users/me")
def update_me(session: Authenticated, payload: Payload, service: Identity):
    return service.update_me(session, payload)


@router.post("/users")
def upsert_user(
    session: Staff,
    payload: Payload,
    service: Identity,
    campaign_service: Campaigns,
):
    # Issuing a token from a campaign screen also puts the account on that
    # table. Ownership is checked up front: failing after `upsert_user` would
    # leave behind an account nobody asked for.
    campaign_id = str(payload.get("campaignId") or "").strip()
    if campaign_id:
        campaign_service.require_owner(campaign_id, session)
    user, created = service.upsert_user(session, payload)
    if campaign_id:
        campaign_service.invite(campaign_id, str(user["username"]), session)
    return JSONResponse(jsonable_encoder(user), status_code=201 if created else 200)


@router.post("/users/{username}/access-token")
def regenerate_access_token(username: str, session: Staff, service: Identity):
    return service.regenerate_access_token(username, session)


@router.delete("/users/{username}")
def delete_user(username: str, session: Staff, service: Identity) -> dict[str, bool]:
    return {"deleted": service.delete_user(username, session)}
