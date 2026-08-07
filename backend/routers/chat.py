"""Native FastAPI shared chat endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from ..application.chat import ChatService
from ..config import _CHAT_RATE
from ..dependencies import chat
from ..schemas import Document
from ..security import _chat_timestamps, check_rate
from .common import ApiError, Session, require_session, require_staff

router = APIRouter(prefix="/api/chat", tags=["chat"])
Chat = Annotated[ChatService, Depends(chat)]
Authenticated = Annotated[Session, Depends(require_session)]
Staff = Annotated[Session, Depends(require_staff)]


@router.get("")
def list_messages(_session: Authenticated, service: Chat) -> list[dict[str, object]]:
    return service.list()


@router.post("", status_code=201)
def post_message(
    request: Request, payload: Document, session: Authenticated, service: Chat
) -> dict[str, object]:
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not check_rate(_chat_timestamps, client_ip, *_CHAT_RATE):
        raise ApiError(429, "Too many messages")
    return service.post(payload.payload(), session)


@router.delete("")
def clear_messages(_session: Staff, service: Chat) -> dict[str, bool]:
    service.clear()
    return {"cleared": True}
