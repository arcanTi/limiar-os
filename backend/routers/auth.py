"""FastAPI boundary for authentication and user management."""
# ruff: noqa: ANN201

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse

from ..application.errors import ApplicationError
from ..application.identity import IdentityService
from ..config import _LOGIN_RATE, GOOGLE_CLIENT_ID
from ..dependencies import identity
from ..security import _login_timestamps, check_rate
from ..services.google_identity import verify_google_id_token
from .common import Session, json_payload, optional_session, require_session, require_staff

router = APIRouter(prefix="/api", tags=["auth"])
Identity = Annotated[IdentityService, Depends(identity)]
Payload = Annotated[dict[str, object], Depends(json_payload)]
Authenticated = Annotated[Session, Depends(require_session)]
Staff = Annotated[Session, Depends(require_staff)]


def _rate_limit(request: Request) -> None:
    ip = request.client.host if request.client else "127.0.0.1"
    if not check_rate(_login_timestamps, ip, *_LOGIN_RATE):
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


@router.post("/register", status_code=201)
def register(request: Request, payload: Payload, service: Identity):
    _rate_limit(request)
    return service.register(payload)


@router.post("/auth/google")
def google_login(request: Request, payload: Payload, service: Identity):
    _rate_limit(request)
    if not GOOGLE_CLIENT_ID:
        raise ApplicationError(503, "Google login not configured")
    id_token = str(payload.get("idToken") or "").strip()
    if not id_token:
        raise ApplicationError(400, "idToken required")
    return service.google_login(verify_google_id_token(id_token))


@router.post("/password-reset-requests")
def request_password_reset(request: Request, payload: Payload, service: Identity):
    _rate_limit(request)
    return service.request_password_reset(str(payload.get("username") or ""))


@router.post("/logout")
def logout(
    session: Annotated[Session | None, Depends(optional_session)],
    service: Identity,
) -> dict[str, bool]:
    return service.logout(session)


@router.get("/password-reset-requests")
def password_reset_requests(_session: Staff, service: Identity):
    return service.password_reset_requests()


@router.delete("/password-reset-requests/{username}")
def delete_password_reset_request(
    username: str,
    _session: Staff,
    service: Identity,
) -> dict[str, bool]:
    return {"deleted": service.delete_password_reset_request(username)}


@router.get("/users")
def users(_session: Staff, service: Identity):
    return service.users()


@router.post("/users/me")
def update_me(session: Authenticated, payload: Payload, service: Identity):
    return service.update_me(session, payload)


@router.post("/users")
def upsert_user(session: Staff, payload: Payload, service: Identity):
    user, created = service.upsert_user(session, payload)
    return JSONResponse(jsonable_encoder(user), status_code=201 if created else 200)


@router.delete("/users/{username}")
def delete_user(username: str, session: Staff, service: Identity) -> dict[str, bool]:
    return {"deleted": service.delete_user(username, session)}
