"""Campaign map routes."""

from http import HTTPStatus
from urllib.parse import parse_qs, unquote, urlparse

from ..domain.validation import ValidationError
from ..repositories.campaign_maps import (
    SceneRevisionConflict,
    TemplateRevisionConflict,
    activate_scene,
    add_fog,
    add_ping,
    can_access_campaign,
    can_edit_campaign_map,
    clear_difficult_terrain,
    clear_reveals,
    damage_prop,
    delete_fog,
    delete_drawing,
    delete_light,
    delete_pin,
    delete_prop,
    delete_template,
    delete_wall,
    delete_token,
    map_state,
    map_update_version,
    move_token,
    move_tokens,
    wait_for_map_update,
    resolve_template,
    save_scene,
    save_drawing,
    save_light,
    save_pin,
    save_prop,
    save_template,
    save_wall,
    sync_player_tokens,
    toggle_difficult_terrain,
    toggle_door,
    toggle_light,
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

    def _get_campaign_map_updates(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        raw_since = parse_qs(urlparse(self.path).query).get("since", ["0"])[0]
        try:
            since = max(0, int(raw_since))
        except (TypeError, ValueError):
            since = 0
        version = wait_for_map_update(campaign_id, since)
        return self.write_json({"version": version, "changed": version != since, "fallback": False})

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

    def _post_campaign_map_move_group(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        if not move_tokens(campaign_id, payload.get("moves"), session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM token group access denied")
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

    def _post_campaign_map_ping(self, campaign_id: str) -> None:
        # Any campaign member can ping — no GM check, same access rule as
        # viewing the map itself.
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        return self.write_json(add_ping(campaign_id, session["username"], payload), HTTPStatus.CREATED)

    def _post_campaign_map_template(self, campaign_id: str) -> None:
        # Any campaign member can place a template — GM edits/deletes any,
        # a player only their own (enforced in save_template/delete_template).
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        result = save_template(campaign_id, payload, session)
        if result is None:
            return self.write_error(HTTPStatus.FORBIDDEN, "Template access denied")
        return self.write_json(result, HTTPStatus.CREATED)

    def _post_campaign_map_delete_template(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        result = delete_template(campaign_id, str(payload.get("templateId") or ""), session)
        if result is None:
            return self.write_error(HTTPStatus.FORBIDDEN, "Template access denied")
        return self.write_json({"deleted": result})

    def _post_campaign_map_resolve_template(self, campaign_id: str) -> None:
        # Fase AREA: owner or GM only, same trust level as delete_template —
        # this is the map-side half of the "2 confirmations" RESOLVER flow
        # (the cockpit apply is the second confirmation).
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        try:
            payload = self.read_json()
        except ValidationError as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")
        try:
            result = resolve_template(campaign_id, str(payload.get("templateId") or ""), payload.get("expectedRevision"), session)
        except TemplateRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Template changed; reload map", "TEMPLATE_REVISION_CONFLICT")
        if result is None:
            return self.write_error(HTTPStatus.FORBIDDEN, "Template access denied")
        return self.write_json(result)

    def _post_campaign_map_sync(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        return self.write_json({"players": sync_player_tokens(campaign_id)})

    def _post_campaign_map_wall(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            return self.write_json(save_wall(campaign_id, self.read_json()), HTTPStatus.CREATED)
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_delete_wall(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
            return self.write_json(delete_wall(campaign_id, str(payload.get("wallId") or ""), payload.get("expectedRevision")))
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_door_toggle(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
            return self.write_json(toggle_door(campaign_id, str(payload.get("wallId") or ""), payload.get("expectedRevision")))
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_prop(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            return self.write_json(save_prop(campaign_id, self.read_json()), HTTPStatus.CREATED)
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_delete_prop(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
            return self.write_json(delete_prop(campaign_id, str(payload.get("propId") or ""), payload.get("expectedRevision")))
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_prop_damage(self, campaign_id: str) -> None:
        # Any campaign member can log damage to a prop — same trust level as
        # a player's own attack roll already applying character damage
        # without a GM click. Props aren't armored characters (G2): flat HP
        # subtraction, no ablation route needed.
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        try:
            payload = self.read_json()
            return self.write_json(damage_prop(campaign_id, str(payload.get("propId") or ""), payload.get("amount"), payload.get("expectedRevision")))
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_light(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            return self.write_json(save_light(campaign_id, self.read_json()), HTTPStatus.CREATED)
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_delete_light(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
            return self.write_json(delete_light(campaign_id, str(payload.get("lightId") or ""), payload.get("expectedRevision")))
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_light_toggle(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        try:
            payload = self.read_json()
            result = toggle_light(campaign_id, str(payload.get("lightId") or ""), payload.get("expectedRevision"), session)
            if result is None:
                return self.write_error(HTTPStatus.FORBIDDEN, "Light access denied")
            return self.write_json(result)
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_drawing(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            return self.write_json(save_drawing(campaign_id, self.read_json()), HTTPStatus.CREATED)
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_delete_drawing(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
            return self.write_json(delete_drawing(campaign_id, str(payload.get("drawingId") or ""), payload.get("expectedRevision")))
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_pin(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            return self.write_json(save_pin(campaign_id, self.read_json()), HTTPStatus.CREATED)
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def _post_campaign_map_delete_pin(self, campaign_id: str) -> None:
        session = self._campaign_map_session(campaign_id)
        if not session:
            return None
        if not can_edit_campaign_map(campaign_id, session):
            return self.write_error(HTTPStatus.FORBIDDEN, "GM login required")
        try:
            payload = self.read_json()
            return self.write_json(delete_pin(campaign_id, str(payload.get("pinId") or ""), payload.get("expectedRevision")))
        except SceneRevisionConflict:
            return self.write_error(HTTPStatus.CONFLICT, "Scene changed; reload map", "SCENE_REVISION_CONFLICT")
        except (ValidationError, ValueError) as e:
            return self.write_error(HTTPStatus.BAD_REQUEST, str(e), "VALIDATION_ERROR")

    def route_campaign_map_get(self, path: str) -> bool:
        prefix = "/api/campaign-maps/"
        if not path.startswith(prefix):
            return False
        tail = path[len(prefix) :]
        if tail.endswith("/updates"):
            campaign_id = unquote(tail[: -len("/updates")])
            if not campaign_id or "/" in campaign_id:
                return False
            self._get_campaign_map_updates(campaign_id)
            return True
        campaign_id = unquote(tail)
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
            "token/move-group": self._post_campaign_map_move_group,
            "fog": self._post_campaign_map_fog,
            "fog/delete": self._post_campaign_map_delete_fog,
            "terrain/toggle": self._post_campaign_map_terrain_toggle,
            "terrain/clear": self._post_campaign_map_terrain_clear,
            "reveals/clear": self._post_campaign_map_clear_reveals,
            "ping": self._post_campaign_map_ping,
            "template": self._post_campaign_map_template,
            "template/delete": self._post_campaign_map_delete_template,
            "template/resolve": self._post_campaign_map_resolve_template,
            "sync": self._post_campaign_map_sync,
            "wall": self._post_campaign_map_wall,
            "wall/delete": self._post_campaign_map_delete_wall,
            "door/toggle": self._post_campaign_map_door_toggle,
            "prop": self._post_campaign_map_prop,
            "prop/delete": self._post_campaign_map_delete_prop,
            "prop/damage": self._post_campaign_map_prop_damage,
            "light": self._post_campaign_map_light,
            "light/delete": self._post_campaign_map_delete_light,
            "light/toggle": self._post_campaign_map_light_toggle,
            "drawing": self._post_campaign_map_drawing,
            "drawing/delete": self._post_campaign_map_delete_drawing,
            "pin": self._post_campaign_map_pin,
            "pin/delete": self._post_campaign_map_delete_pin,
        }
        handler = routes.get(action)
        if not handler:
            return False
        handler(campaign_id)
        return True
