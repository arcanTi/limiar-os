"""Campaign-map application boundary.

HTTP code depends on this aggregate service, never on SQL functions directly;
repository modules can evolve without changing the transport contract.
"""

from typing import Any

from ..domain.access import is_staff
from .errors import ApplicationError
from .ports import Session


class CampaignMapService:
    """Authorize map use cases and delegate persistence through an adapter."""
    def __init__(self, repository: Any, campaigns: Any) -> None:  # noqa: ANN401
        self._repository = repository
        self._campaigns = campaigns

    def ensure_access(self, campaign_id: str, session: Session) -> None:
        if not self._campaigns.get_campaign(campaign_id):
            raise ApplicationError(404, "Campaign not found")
        if not self._campaigns.is_campaign_member(campaign_id, dict(session)):
            raise ApplicationError(403, "Campaign access denied")

    def ensure_editor(self, campaign_id: str, session: Session) -> None:
        self.ensure_access(campaign_id, session)
        if not is_staff(session):
            raise ApplicationError(403, "GM login required")

    def __getattr__(self, operation: str) -> Any:  # noqa: ANN401
        """Expose repository operations behind the map aggregate boundary."""
        return getattr(self._repository, operation)
