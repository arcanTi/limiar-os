"""Campaign event authorization and stream use cases."""

from collections.abc import Callable

from .errors import ApplicationError
from .ports import (
    CampaignAccessRepository,
    CampaignEventRepository,
    Record,
    Session,
)
from .sessions import SessionService


class CampaignEventService:
    """Provide a transport-neutral boundary for campaign event streams."""

    def __init__(
        self,
        sessions: SessionService,
        campaigns: CampaignAccessRepository,
        events: CampaignEventRepository,
    ) -> None:
        self._sessions = sessions
        self._campaigns = campaigns
        self._events = events

    def authorize(self, token: str, campaign_id: str) -> Session:
        session = self._sessions.resolve(token)
        if not session:
            raise ApplicationError(401, "Authentication required")
        if not self._campaigns.get_campaign(campaign_id):
            raise ApplicationError(404, "Campaign not found")
        if not self._campaigns.is_campaign_member(campaign_id, session):
            raise ApplicationError(403, "Campaign access denied")
        return session

    def subscribe(self, listener: Callable[[Record], None]) -> Callable[[], None]:
        return self._events.subscribe(listener)

    def snapshot(self, campaign_id: str, since: int) -> Record:
        return self._events.snapshot_since(campaign_id, max(0, since))

    def current_version(self, campaign_id: str) -> int:
        return self._events.current_version(campaign_id)
