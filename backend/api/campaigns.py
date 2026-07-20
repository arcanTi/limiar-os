"""Campaign routes: creation, invitations, membership and notifications."""

from http import HTTPStatus
from urllib.parse import parse_qs, unquote, urlparse

from ..domain.validation import ValidationError
from ..repositories import campaign_sync
from ..repositories.campaigns import (
    cancel_invite,
    get_campaign,
    invite_player,
    is_campaign_member,
    is_campaign_owner,
    join_campaign,
    list_campaigns_for,
    notifications_for,
    remove_member,
    upsert_campaign,
)
from ..repositories.records import get_record
from ..util import slug


class CampaignRoutes:
    """Routes for campaign access control."""

    def _get_campaigns(self) -> None:
        session = self.require_login()
        if not session:
            return None
        self.write_json(list_campaigns_for(session))

    def _get_notifications(self) -> None:
        session = self.require_login()
        if not session:
            return None
        self.write_json(notifications_for(session))

    def _require_campaign_owner(self, campaign_id: str) -> dict[str, str] | None:
        """GM-management gate for a specific campaign: admin, or the GM who
        created it. Writes a 403 and returns None on failure."""
        session = self.require_gm()
        if not session:
            return None
        if not is_campaign_owner(campaign_id, session):
            self.write_error(HTTPStatus.FORBIDDEN, "Apenas o mestre desta campanha pode gerenciá-la")
            return None
        return session

    def _post_campaigns(self) -> None:
        session = self.require_gm()
        if not session:
            return None
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        if not str(payload.get("name") or "").strip():
            return self.write_error(HTTPStatus.BAD_REQUEST, "Campaign name required")
        campaign_id = str(payload.get("id") or slug(str(payload.get("name") or "")))[:120]
        if get_campaign(campaign_id) and not is_campaign_owner(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "Apenas o mestre desta campanha pode editá-la")
        self.write_json(upsert_campaign(payload, session), HTTPStatus.CREATED)

    def _post_campaign_invite(self, campaign_id: str) -> None:
        session = self._require_campaign_owner(campaign_id)
        if not session:
            return None
        campaign = get_campaign(campaign_id)
        if not campaign:
            return self.write_error(HTTPStatus.NOT_FOUND, "Campaign not found")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        username = str(payload.get("username") or "").strip()
        if not username:
            return self.write_error(HTTPStatus.BAD_REQUEST, "Username required")
        return self.write_json(invite_player(campaign_id, username, session), HTTPStatus.CREATED)

    def _post_campaign_join(self, campaign_id: str) -> None:
        session = self.require_login()
        if not session:
            return None
        campaign = get_campaign(campaign_id)
        if not campaign:
            return self.write_error(HTTPStatus.NOT_FOUND, "Campaign not found")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        character_id = str(payload.get("characterId") or "").strip()
        if not character_id:
            return self.write_error(HTTPStatus.BAD_REQUEST, "Character required")
        character = get_record("characters", character_id)
        if not character:
            return self.write_error(HTTPStatus.NOT_FOUND, "Character not found")
        owner = str(character.get("ownerUsername") or character.get("createdBy") or "")
        if session.get("role") == "player" and owner != session["username"]:
            return self.write_error(HTTPStatus.FORBIDDEN, "Character access denied")
        visible = list_campaigns_for(session)
        row = next((item for item in visible if item.get("id") == campaign_id), None)
        if not row or not row.get("canJoin"):
            return self.write_error(HTTPStatus.FORBIDDEN, "Campaign access denied")
        return self.write_json(join_campaign(campaign_id, character_id, session), HTTPStatus.CREATED)

    def _get_campaign_updates(self, campaign_id: str) -> None:
        session = self.require_login()
        if not session:
            return None
        if not get_campaign(campaign_id):
            return self.write_error(HTTPStatus.NOT_FOUND, "Campaign not found")
        if not is_campaign_member(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "Campaign access denied")
        raw_since = parse_qs(urlparse(self.path).query).get("since", ["0"])[0]
        try:
            since = max(0, int(raw_since))
        except (TypeError, ValueError):
            since = 0
        return self.write_json(campaign_sync.wait_for_campaign_update(campaign_id, since))

    def route_campaign_updates_get(self, path: str) -> bool:
        prefix = "/api/campaigns/"
        if not path.startswith(prefix) or not path.endswith("/updates"):
            return False
        campaign_id = unquote(path[len(prefix) : -len("/updates")])
        if not campaign_id or "/" in campaign_id:
            return False
        self._get_campaign_updates(campaign_id)
        return True

    def route_campaign_post(self, path: str) -> bool:
        if path == "/api/campaigns":
            self._post_campaigns()
            return True
        if path.startswith("/api/campaigns/") and path.endswith("/invite"):
            campaign_id = unquote(path[len("/api/campaigns/") : -len("/invite")])
            self._post_campaign_invite(campaign_id)
            return True
        if path.startswith("/api/campaigns/") and path.endswith("/join"):
            campaign_id = unquote(path[len("/api/campaigns/") : -len("/join")])
            self._post_campaign_join(campaign_id)
            return True
        return False

    def _delete_campaign_invite(self, campaign_id: str, username: str) -> None:
        session = self._require_campaign_owner(campaign_id)
        if not session:
            return None
        self.write_json({"cancelled": cancel_invite(campaign_id, username)})

    def _delete_campaign_member(self, campaign_id: str, username: str) -> None:
        session = self._require_campaign_owner(campaign_id)
        if not session:
            return None
        self.write_json({"removed": remove_member(campaign_id, username)})

    def route_campaign_delete(self, path: str) -> bool:
        prefix = "/api/campaigns/"
        if not path.startswith(prefix):
            return False
        rest = path[len(prefix):]
        for marker, handler in (("/invites/", self._delete_campaign_invite), ("/members/", self._delete_campaign_member)):
            if marker in rest:
                campaign_id, _, username = rest.partition(marker)
                campaign_id, username = unquote(campaign_id), unquote(username)
                if not campaign_id or not username:
                    return False
                handler(campaign_id, username)
                return True
        return False
