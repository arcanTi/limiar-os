"""Campaign map routes."""

from http import HTTPStatus
from urllib.parse import unquote

from ..domain.validation import ValidationError
from ..repositories.campaign_maps import (
    activate_scene,
    add_fog,
    can_access_campaign,
    can_edit_campaign_map,
    clear_difficult_terrain,
    clear_reveals,
    delete_fog,
    delete_token,
    map_state,
    move_token,
    save_scene,
    sync_player_tokens,
    toggle_difficult_terrain,
    upsert_token,
)
from ..repositories.campaigns import get_campaign


class CampaignMapRoutes:
    """Routes for Roll20-style maps linked to campaigns."""

    def _campaign_map_session(self, campaign_id: str):
        session = self.require_login()
        if not session:
            return None
        if not get_campaign(campaign_id):
            self.write_error(HTTPStatus.NOT_FOUND, "Campaign not found")
            return None
        if not can_access_campaign(campaign_id, session):
            self.write_error(HTTPStatus.FORBIDDEN, "Campaign access denied")
            return None
        return session

    def _get_campaign_map(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        return self.write_json(map_state(campaign_id, session))

    def _post_campaign_map_scene(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json(save_scene(campaign_id, payload))

    def _post_campaign_map_activate(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        scene = activate_scene(campaign_id, str(payload.get("sceneId") or ""))
        if not scene:
            return self.write_error(HTTPStatus.NOT_FOUND, "Scene not found")
        return self.write_json(scene)

    def _post_campaign_map_token(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json(upsert_token(campaign_id, payload), HTTPStatus.CREATED)

    def _post_campaign_map_move(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        ok = move_token(
            campaign_id,
            str(payload.get("tokenId") or ""),
            float(payload.get("x") or 0),
            float(payload.get("y") or 0),
            session,
        )
        if not ok:
            return self.write_error(HTTPStatus.FORBIDDEN, "Token access denied")
        return self.write_json({"moved": True})

    def _post_campaign_map_delete_token(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json({"deleted": delete_token(campaign_id, str(payload.get("tokenId") or ""))})

    def _post_campaign_map_fog(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json(add_fog(campaign_id, payload), HTTPStatus.CREATED)

    def _post_campaign_map_delete_fog(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json({"deleted": delete_fog(campaign_id, str(payload.get("fogId") or ""))})

    def _post_campaign_map_terrain_toggle(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        try:
            gx, gy = int(payload.get("x")), int(payload.get("y"))
        except (TypeError, ValueError):
            return self.write_error(HTTPStatus.BAD_REQUEST, "x/y must be grid cell integers", "VALIDATION_ERROR")
        return self.write_json(toggle_difficult_terrain(campaign_id, gx, gy))

    def _post_campaign_map_terrain_clear(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        return self.write_json(clear_difficult_terrain(campaign_id))

    def _post_campaign_map_clear_reveals(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        return self.write_json({"cleared": clear_reveals(campaign_id)})

    def _post_campaign_map_sync(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        return self.write_json({"players": sync_player_tokens(campaign_id)})

    def route_campaign_map_get(self, path: str) -> bool:
        prefix = "/api/campaign-maps/"
        if not path.startswith(prefix):
            return False
        campaign_id = unquote(path[len(prefix) :])
        if not campaign_id or "/" in campaign_id:
            return False
        self._get_campaign_map(campaign_id)
        return True

    def route_campaign_map_post(self, path: str) -> bool:
        prefix = "/api/campaign-maps/"
        if not path.startswith(prefix):
            return False
        tail = path[len(prefix) :]
        if "/" not in tail:
            return False
        campaign_id, action = tail.split("/", 1)
        campaign_id = unquote(campaign_id)
        routes = {
            "scene": self._post_campaign_map_scene,
            "activate": self._post_campaign_map_activate,
            "token": self._post_campaign_map_token,
            "token/delete": self._post_campaign_map_delete_token,
            "token/move": self._post_campaign_map_move,
            "fog": self._post_campaign_map_fog,
            "fog/delete": self._post_campaign_map_delete_fog,
            "terrain/toggle": self._post_campaign_map_terrain_toggle,
            "terrain/clear": self._post_campaign_map_terrain_clear,
            "reveals/clear": self._post_campaign_map_clear_reveals,
            "sync": self._post_campaign_map_sync,
        }
        handler = routes.get(action)
        if not handler:
            return False
        handler(campaign_id)
        return True
