"""Shared chat use cases."""

from ..domain.validation import validate_chat
from .ports import ChatRepository, Record, Session


class ChatService:
    """Validate chat messages and stamp the trusted session role."""
    def __init__(self, chat: ChatRepository) -> None:
        self.chat = chat

    def list(self) -> list[Record]:
        return self.chat.list()

    def post(self, payload: Record, session: Session) -> Record:
        validate_chat(payload)
        role = "gm" if session.get("role") == "gm" else "player"
        return self.chat.append(payload, role)

    def clear(self) -> None:
        self.chat.clear()
