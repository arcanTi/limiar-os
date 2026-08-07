"""Shared FastAPI dependencies and the stable API error contract."""

import json
from typing import Annotated

from fastapi import Depends, Header, Request
from fastapi.responses import JSONResponse

from ..application.errors import ApplicationError
from ..application.sessions import SessionService
from ..config import _MAX_BODY_BYTES
from ..dependencies import sessions

Session = dict[str, str]


ApiError = ApplicationError


def problem_response(problem: ApplicationError) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": problem.code, "message": problem.message}},
        status_code=problem.status,
    )


async def json_payload(request: Request) -> dict[str, object]:
    length = int(request.headers.get("content-length") or 0)
    if length > _MAX_BODY_BYTES:
        raise ApiError(413, "Request body too large")
    body = await request.body()
    if len(body) > _MAX_BODY_BYTES:
        raise ApiError(413, "Request body too large")
    if not body:
        return {}
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ApiError(400, "Request body must be valid JSON", "VALIDATION_ERROR") from exc
    if not isinstance(payload, dict):
        raise ApiError(400, "Request body must be a JSON object", "VALIDATION_ERROR")
    return payload


def optional_session(
    service: Annotated[SessionService, Depends(sessions)],
    authorization: Annotated[str | None, Header()] = None,
) -> Session | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return service.resolve(authorization.split(" ", 1)[1].strip())


def require_session(session: Annotated[Session | None, Depends(optional_session)]) -> Session:
    if not session:
        raise ApiError(401, "Authentication required")
    return session


def require_staff(session: Annotated[Session, Depends(require_session)]) -> Session:
    if session.get("role") not in {"admin", "gm"}:
        raise ApiError(401, "GM login required")
    return session
