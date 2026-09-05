"""Campaign membership and invitation use cases."""

from __future__ import annotations

from typing import Any

from ..util import slug
from .errors import ApplicationError
from .ports import Record, Session


class CampaignService:
    """Coordinate campaign lifecycle, membership, and notifications."""
    def __init__(self, campaigns: Any, records: Any, events: Any) -> None:  # noqa: ANN401
        self.campaigns = campaigns
        self.records = records
        self.events = events

    def list(self, session: Session) -> list[Record]:
        return self.campaigns.list_campaigns_for(dict(session))

    def notifications(self, session: Session) -> list[Record]:
        return self.campaigns.notifications_for(dict(session))

    def save(self, payload: Record, session: Session) -> Record:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise ApplicationError(400, "Campaign name required")
        campaign_id = str(payload.get("id") or slug(name))[:120]
        if self.campaigns.get_campaign(campaign_id) and not self.campaigns.is_campaign_owner(
            campaign_id, dict(session)
        ):
            raise ApplicationError(403, "Apenas o mestre desta campanha pode editá-la")
        return self.campaigns.upsert_campaign(payload, dict(session))

    def require_owner(self, campaign_id: str, session: Session) -> None:
        """Public ownership gate, for callers that must check before acting."""
        self._owner(campaign_id, session)

    def invite(self, campaign_id: str, username: str, session: Session) -> Record:
        self._owner(campaign_id, session)
        if not username.strip():
            raise ApplicationError(400, "Username required")
        return self.campaigns.invite_player(campaign_id, username.strip(), dict(session))

    def join(self, campaign_id: str, character_id: str, session: Session) -> Record:
        if not self.campaigns.get_campaign(campaign_id):
            raise ApplicationError(404, "Campaign not found")
        if not character_id:
            raise ApplicationError(400, "Character required")
        character = self.records.get("characters", character_id)
        if not character:
            raise ApplicationError(404, "Character not found")
        owner = str(character.get("ownerUsername") or character.get("createdBy") or "")
        if session.get("role") == "player" and owner != session["username"]:
            raise ApplicationError(403, "Character access denied")
        visible = self.campaigns.list_campaigns_for(dict(session))
        row = next((item for item in visible if item.get("id") == campaign_id), None)
        # A player already seated at the table may join again with another of
        # their own sheets: the new operative replaces the previous seat. Only
        # outsiders need the public/invited `canJoin` gate.
        if not row or not (row.get("canJoin") or row.get("isMember")):
            raise ApplicationError(403, "Campaign access denied")
        return self.campaigns.join_campaign(campaign_id, character_id, dict(session))

    def grant_control(
        self,
        campaign_id: str,
        character_id: str,
        username: str,
        session: Session,
    ) -> Record:
        """Hand an absent player's sheet to another player at the table.

        Only the GM of this campaign decides, and only over a sheet this table
        actually seated: a delegation is a seat standing in for another seat,
        never a way to reach a character from outside the campaign.
        """
        self._owner(campaign_id, session)
        username = username.strip()
        if not username:
            raise ApplicationError(400, "Username required")
        members = self.campaigns.list_members(campaign_id)
        seat = next((m for m in members if str(m.get("character_id")) == character_id), None)
        if not seat:
            raise ApplicationError(404, "Character is not seated in this campaign")
        if not any(m.get("username") == username for m in members):
            raise ApplicationError(403, "Substitute must be a member of this campaign")
        if seat.get("username") == username:
            raise ApplicationError(400, "Character already belongs to this player")
        return self.campaigns.grant_delegation(
            campaign_id, character_id, username, session["username"]
        )

    def revoke_control(self, campaign_id: str, character_id: str, session: Session) -> bool:
        self._owner(campaign_id, session)
        return self.campaigns.revoke_delegation(campaign_id, character_id)

    def updates(self, campaign_id: str, since: int, session: Session) -> Record:
        self._member(campaign_id, session)
        return self.events.wait_for_campaign_update(campaign_id, max(0, since))

    def cancel_invite(self, campaign_id: str, username: str, session: Session) -> bool:
        self._owner(campaign_id, session)
        return self.campaigns.cancel_invite(campaign_id, username)

    def remove_member(self, campaign_id: str, username: str, session: Session) -> bool:
        self._owner(campaign_id, session)
        return self.campaigns.remove_member(campaign_id, username)

    def _owner(self, campaign_id: str, session: Session) -> None:
        if not self.campaigns.is_campaign_owner(campaign_id, dict(session)):
            raise ApplicationError(403, "Apenas o mestre desta campanha pode gerenciá-la")

    def _member(self, campaign_id: str, session: Session) -> None:
        if not self.campaigns.get_campaign(campaign_id):
            raise ApplicationError(404, "Campaign not found")
        if not self.campaigns.is_campaign_member(campaign_id, dict(session)):
            raise ApplicationError(403, "Campaign access denied")
