"""Shared chat use cases."""

from ..domain.validation import validate_chat
from .errors import ApplicationError
from .ports import CampaignAccessRepository, ChatRepository, Record, Session


class ChatService:
    """Validate chat messages and stamp the trusted session role."""
    def __init__(self, chat: ChatRepository, campaigns: CampaignAccessRepository) -> None:
        self.chat = chat
        self.campaigns = campaigns

    def list(self, campaign_id: str, session: Session) -> list[Record]:
        self._member(campaign_id, session)
        return self.chat.list(campaign_id)

    def post(self, campaign_id: str, payload: Record, session: Session) -> Record:
        self._member(campaign_id, session)
        validate_chat(payload)
        role = "gm" if session.get("role") == "gm" else "player"
        return self.chat.append(campaign_id, payload, role)

    def clear(self, campaign_id: str, session: Session) -> None:
        self._member(campaign_id, session)
        self.chat.clear(campaign_id)

    def _member(self, campaign_id: str, session: Session) -> None:
        if not self.campaigns.get_campaign(campaign_id):
            raise ApplicationError(404, "Campaign not found")
        if not self.campaigns.is_campaign_member(campaign_id, dict(session)):
            raise ApplicationError(403, "Campaign access denied")
