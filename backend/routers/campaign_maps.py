"""Native FastAPI routes for the campaign battle map (Mesa)."""
# ruff: noqa: ANN201

from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from ..dependencies import campaign_maps
from ..domain.validation import ValidationError
from .common import ApiError, Session, json_payload, require_session

router = APIRouter(prefix="/api/campaign-maps", tags=["campaign-maps"])
Payload = Annotated[dict[str, object], Depends(json_payload)]
Authenticated = Annotated[Session, Depends(require_session)]
maps = campaign_maps()


def _access(campaign_id: str, session: Session) -> None:
    maps.ensure_access(campaign_id, session)


def _editor(campaign_id: str, session: Session) -> None:
    maps.ensure_editor(campaign_id, session)


def _scene_mutation(call: Callable[[], object], status_code: int = 200) -> object:
    try:
        result = call()
    except maps.SceneRevisionConflict as exc:
        raise ApiError(
            409,
            "Scene changed; reload map",
            "SCENE_REVISION_CONFLICT",
        ) from exc
    except (ValidationError, ValueError) as exc:
        raise ApiError(400, str(exc), "VALIDATION_ERROR") from exc
    if status_code == 200:
        return result
    return JSONResponse(result, status_code=status_code)


@router.get("/{campaign_id}")
def get_map(campaign_id: str, session: Authenticated):
    _access(campaign_id, session)
    return maps.map_state(campaign_id, session)


@router.get("/{campaign_id}/updates")
def get_map_updates(campaign_id: str, session: Authenticated, since: int = 0):
    _access(campaign_id, session)
    since = max(0, since)
    version = maps.wait_for_map_update(campaign_id, since)
    return {"version": version, "changed": version != since, "fallback": False}


@router.post("/{campaign_id}/scene")
def scene(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(lambda: maps.save_scene(campaign_id, payload))


@router.post("/{campaign_id}/activate")
def activate(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    result = maps.activate_scene(campaign_id, str(payload.get("sceneId") or ""))
    if not result:
        raise ApiError(404, "Scene not found")
    return result


@router.post("/{campaign_id}/token", status_code=201)
def token(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return maps.upsert_token(campaign_id, payload)


@router.post("/{campaign_id}/token/delete")
def delete_map_token(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return {"deleted": maps.delete_token(campaign_id, str(payload.get("tokenId") or ""))}


@router.post("/{campaign_id}/token/move")
def move_map_token(campaign_id: str, session: Authenticated, payload: Payload):
    _access(campaign_id, session)
    try:
        moved = maps.move_token(
            campaign_id,
            str(payload.get("tokenId") or ""),
            float(payload.get("x") or 0),
            float(payload.get("y") or 0),
            session,
        )
    except (TypeError, ValueError) as exc:
        raise ApiError(400, str(exc), "VALIDATION_ERROR") from exc
    if not moved:
        raise ApiError(403, "Token access denied")
    return {"moved": True}


@router.post("/{campaign_id}/token/move-group")
def move_map_tokens(campaign_id: str, session: Authenticated, payload: Payload):
    _access(campaign_id, session)
    if not maps.move_tokens(campaign_id, payload.get("moves"), session):
        raise ApiError(403, "GM token group access denied")
    return {"moved": True}


@router.post("/{campaign_id}/fog", status_code=201)
def fog(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return maps.add_fog(campaign_id, payload)


@router.post("/{campaign_id}/fog/delete")
def delete_map_fog(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return {"deleted": maps.delete_fog(campaign_id, str(payload.get("fogId") or ""))}


@router.post("/{campaign_id}/terrain/toggle")
def terrain_toggle(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    try:
        gx, gy = int(payload.get("x")), int(payload.get("y"))
    except (TypeError, ValueError) as exc:
        raise ApiError(
            400,
            "x/y must be grid cell integers",
            "VALIDATION_ERROR",
        ) from exc
    return maps.toggle_difficult_terrain(campaign_id, gx, gy)


@router.post("/{campaign_id}/terrain/clear")
def terrain_clear(campaign_id: str, session: Authenticated):
    _editor(campaign_id, session)
    return maps.clear_difficult_terrain(campaign_id)


@router.post("/{campaign_id}/reveals/clear")
def reveals_clear(campaign_id: str, session: Authenticated):
    _editor(campaign_id, session)
    return {"cleared": maps.clear_reveals(campaign_id)}


@router.post("/{campaign_id}/ping", status_code=201)
def ping(campaign_id: str, session: Authenticated, payload: Payload):
    _access(campaign_id, session)
    return maps.add_ping(campaign_id, session["username"], payload)


@router.post("/{campaign_id}/template", status_code=201)
def template(campaign_id: str, session: Authenticated, payload: Payload):
    _access(campaign_id, session)
    result = maps.save_template(campaign_id, payload, session)
    if result is None:
        raise ApiError(403, "Template access denied")
    return result


@router.post("/{campaign_id}/template/delete")
def delete_map_template(campaign_id: str, session: Authenticated, payload: Payload):
    _access(campaign_id, session)
    result = maps.delete_template(campaign_id, str(payload.get("templateId") or ""), session)
    if result is None:
        raise ApiError(403, "Template access denied")
    return {"deleted": result}


@router.post("/{campaign_id}/template/resolve")
def resolve_map_template(campaign_id: str, session: Authenticated, payload: Payload):
    _access(campaign_id, session)
    try:
        result = maps.resolve_template(
            campaign_id,
            str(payload.get("templateId") or ""),
            payload.get("expectedRevision"),
            session,
        )
    except maps.TemplateRevisionConflict as exc:
        raise ApiError(
            409,
            "Template changed; reload map",
            "TEMPLATE_REVISION_CONFLICT",
        ) from exc
    if result is None:
        raise ApiError(403, "Template access denied")
    return result


@router.post("/{campaign_id}/sync")
def sync(campaign_id: str, session: Authenticated):
    _editor(campaign_id, session)
    return {"players": maps.sync_player_tokens(campaign_id)}


@router.post("/{campaign_id}/wall", status_code=201)
def wall(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(lambda: maps.save_wall(campaign_id, payload), 201)


@router.post("/{campaign_id}/wall/delete")
def delete_map_wall(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(
        lambda: maps.delete_wall(
            campaign_id,
            str(payload.get("wallId") or ""),
            payload.get("expectedRevision"),
        )
    )


@router.post("/{campaign_id}/door/toggle")
def door_toggle(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(
        lambda: maps.toggle_door(
            campaign_id,
            str(payload.get("wallId") or ""),
            payload.get("expectedRevision"),
        )
    )


@router.post("/{campaign_id}/prop", status_code=201)
def prop(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(lambda: maps.save_prop(campaign_id, payload), 201)


@router.post("/{campaign_id}/prop/delete")
def delete_map_prop(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(
        lambda: maps.delete_prop(
            campaign_id,
            str(payload.get("propId") or ""),
            payload.get("expectedRevision"),
        )
    )


@router.post("/{campaign_id}/prop/damage")
def prop_damage(campaign_id: str, session: Authenticated, payload: Payload):
    _access(campaign_id, session)
    return _scene_mutation(
        lambda: maps.damage_prop(
            campaign_id,
            str(payload.get("propId") or ""),
            payload.get("amount"),
            payload.get("expectedRevision"),
        )
    )


@router.post("/{campaign_id}/light", status_code=201)
def light(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(lambda: maps.save_light(campaign_id, payload), 201)


@router.post("/{campaign_id}/light/delete")
def delete_map_light(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(
        lambda: maps.delete_light(
            campaign_id,
            str(payload.get("lightId") or ""),
            payload.get("expectedRevision"),
        )
    )


@router.post("/{campaign_id}/light/toggle")
def light_toggle(campaign_id: str, session: Authenticated, payload: Payload):
    _access(campaign_id, session)

    def apply_toggle() -> object:
        result = maps.toggle_light(
            campaign_id,
            str(payload.get("lightId") or ""),
            payload.get("expectedRevision"),
            session,
        )
        if result is None:
            raise ApiError(403, "Light access denied")
        return result

    return _scene_mutation(apply_toggle)


@router.post("/{campaign_id}/drawing", status_code=201)
def drawing(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(lambda: maps.save_drawing(campaign_id, payload), 201)


@router.post("/{campaign_id}/drawing/delete")
def delete_map_drawing(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(
        lambda: maps.delete_drawing(
            campaign_id,
            str(payload.get("drawingId") or ""),
            payload.get("expectedRevision"),
        )
    )


@router.post("/{campaign_id}/pin", status_code=201)
def pin(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(lambda: maps.save_pin(campaign_id, payload), 201)


@router.post("/{campaign_id}/pin/delete")
def delete_map_pin(campaign_id: str, session: Authenticated, payload: Payload):
    _editor(campaign_id, session)
    return _scene_mutation(
        lambda: maps.delete_pin(
            campaign_id,
            str(payload.get("pinId") or ""),
            payload.get("expectedRevision"),
        )
    )
