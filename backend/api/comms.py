"""Comms routes: the shared player/GM chat log."""

from http import HTTPStatus

from ..config import _CHAT_RATE
from ..domain.validation import ValidationError, validate_chat
from ..repositories import campaign_sync
from ..repositories.chat import append_chat, list_chat
from ..security import _chat_timestamps, check_rate


class CommsRoutes:
    """Routes for the shared player/GM chat log."""

    def _get_chat(self) -> None:
        self.write_json(list_chat())

    # Shared comms channel. Open to players (unauthenticated) and GM alike;
    # the role is decided server-side from the session so players cannot
    # spoof a GM message. Players posting roll results is how the GM is
    # notified of every roll.
    def _post_chat(self) -> None:
        ip = self.client_address[0]
        if not check_rate(_chat_timestamps, ip, *_CHAT_RATE):
            return self.write_error(HTTPStatus.TOO_MANY_REQUESTS, "Too many messages")
        try:
            payload = self.read_json()
            validate_chat(payload)
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        session = self.current_session()
        role = "gm" if session and session.get("role") == "gm" else "player"
        entry = append_chat(payload, role)
        campaign_sync.bump_all("chat")
        return self.write_json(entry, HTTPStatus.CREATED)
