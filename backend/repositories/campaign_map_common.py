"""Shared policies and projections for campaign-map aggregates."""

import json
from collections.abc import Mapping
from typing import Any

from . import campaign_sync
from .campaigns import is_campaign_member

EXPLORATION_MODES = ("shared", "individual")
RESOURCE_VISIBILITIES = ("gm", "owner", "party")
LIGHT_KINDS = ("ambient", "token", "effect")

def map_update_version(campaign_id: str) -> int:
    return campaign_sync.current_version(campaign_id)


def touch_map_update(campaign_id: str) -> int:
    # Map tables emit their event in the same transaction through PostgreSQL
    # triggers. This compatibility name now only reads the committed version.
    return campaign_sync.current_version(campaign_id)


def wait_for_map_update(campaign_id: str, since: int, timeout: float = 25.0) -> int:
    result = campaign_sync.wait_for_campaign_update(campaign_id, since, timeout)
    return int(result["version"])


def row_dict(row: Mapping[str, object] | None) -> dict[str, Any]:
    return dict(row) if row else {}


def is_staff(session: dict[str, str]) -> bool:
    return session.get("role") in ("admin", "gm")


def can_access_campaign(campaign_id: str, session: dict[str, str]) -> bool:
    return is_campaign_member(campaign_id, session)


def can_edit_campaign_map(_campaign_id: str, session: dict[str, str]) -> bool:
    return is_staff(session)


def _parse_difficult_terrain(raw: Any) -> list[list[int]]:
    try:
        cells = json.loads(raw) if isinstance(raw, str) else raw or []
    except (TypeError, ValueError):
        return []
    if not isinstance(cells, list):
        return []
    out: list[list[int]] = []
    for cell in cells:
        if isinstance(cell, list | tuple) and len(cell) == 2:
            try:
                out.append([int(cell[0]), int(cell[1])])
            except (TypeError, ValueError):
                continue
    return out


def normalize_scene(scene: dict[str, Any]) -> dict[str, Any]:
    if not scene:
        return {}
    return {
        "id": scene["id"],
        "campaignId": scene["campaign_id"],
        "name": scene.get("name") or "Cena",
        "background": scene.get("background") or "",
        "backgroundFit": scene.get("background_fit") or "contain",
        "width": int(scene.get("width") or 1600),
        "height": int(scene.get("height") or 1000),
        "gridSize": int(scene.get("grid_size") or 64),
        "fogEnabled": bool(scene.get("fog_enabled")),
        "shadowOpacity": float(scene.get("shadow_opacity") or 0.92),
        "darkness": max(0.0, min(1.0, float(scene.get("darkness") or 0))),
        "active": bool(scene.get("active")),
        "difficultTerrain": _parse_difficult_terrain(scene.get("difficult_terrain")),
        "explorationMode": (
            scene.get("exploration_mode")
            if scene.get("exploration_mode") in EXPLORATION_MODES
            else "shared"
        ),
        "revision": int(scene.get("revision") or 0),
    }


def default_resource_visibility(kind: str) -> str:
    """Player tokens are party-visible by default (matches the old
    kind-based rule); NPCs/markers default to GM-only until the GM opts a
    specific one in — a monster's wound state isn't free intel."""
    return "party" if kind == "player" else "gm"


def _resource_visible_to(out: dict[str, Any], session: dict[str, str] | None) -> bool:
    if not session or is_staff(session):
        return True
    visibility = out.get("resourceVisibility") or "party"
    if visibility == "party":
        return True
    if visibility == "owner":
        return out.get("ownerUsername") == session.get("username")
    return False


def _primary_ammo_weapon(character: dict[str, Any] | None) -> dict[str, Any] | None:
    gear = (character or {}).get("gear") or []
    candidates = [row for row in gear if isinstance(row, dict) and row.get("magazine") is not None]
    if not candidates:
        return None
    return next((row for row in candidates if row.get("equipped")), candidates[0])


def _token_ammo(character: dict[str, Any] | None) -> dict[str, Any] | None:
    weapon = _primary_ammo_weapon(character)
    if not weapon:
        return None
    magazine = weapon.get("magazine")
    current = weapon.get("currentAmmo")
    return {
        "weaponId": weapon.get("id"),
        "weaponName": weapon.get("name") or "Arma",
        "currentAmmo": current if current is not None else magazine,
        "magazine": magazine,
    }


def normalize_token(
    token: dict[str, Any],
    session: dict[str, str] | None = None,
    character: dict[str, Any] | None = None,
) -> dict[str, Any]:
    out = {
        "id": token["id"],
        "campaignId": token["campaign_id"],
        "sceneId": token["scene_id"],
        "characterId": token.get("character_id"),
        "name": token.get("name") or "Token",
        "kind": token.get("kind") or "npc",
        "ownerUsername": token.get("owner_username"),
        "x": float(token.get("x") or 0),
        "y": float(token.get("y") or 0),
        "size": float(token.get("size") or 1),
        "color": token.get("color") or "#d6aa4e",
        "image": token.get("image") or "",
        "hp": token.get("hp"),
        "hpMax": token.get("hp_max"),
        "vision": int(token.get("vision") or 240),
        "visionDistanceUnits": (
            float(token["vision_distance_units"])
            if token.get("vision_distance_units") is not None
            else None
        ),
        "rotation": float(token.get("rotation") or 0) % 360,
        "elevation": float(token.get("elevation") or 0),
        "visible": bool(token.get("visible")),
        "move": float(token["move"]) if token.get("move") is not None else None,
        "resourceVisibility": token.get("resource_visibility")
        or default_resource_visibility(token.get("kind") or "npc"),
        "criticalInjuries": (character or {}).get("criticalInjuries") or [],
        "statusEffects": (character or {}).get("statusEffects") or [],
        "ammo": _token_ammo(character),
    }
    if not _resource_visible_to(out, session):
        out["hp"] = None
        out["hpMax"] = None
        out["criticalInjuries"] = []
        out["statusEffects"] = []
        out["ammo"] = None
    return out


def vision_radius_px(token: dict[str, Any], scene: dict[str, Any]) -> float:
    units = token.get("vision_distance_units")
    if units is None:
        return float(token.get("vision") or 0)
    return max(0.0, float(units)) / 2.0 * float(scene.get("gridSize") or 64)


def normalize_wall(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"], "campaignId": row["campaign_id"], "sceneId": row["scene_id"],
        "x1": float(row["x1"]), "y1": float(row["y1"]), "x2": float(row["x2"]), "y2": float(row["y2"]),
        "kind": row.get("kind") if row.get("kind") in ("wall", "door") else "wall",
        "open": bool(row.get("open")),
    }


def normalize_light(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"], "campaignId": row["campaign_id"], "sceneId": row["scene_id"],
        "kind": row.get("kind") if row.get("kind") in LIGHT_KINDS else "ambient",
        "x": float(row.get("x") or 0), "y": float(row.get("y") or 0), "tokenId": row.get("token_id"),
        "brightUnits": float(row.get("bright_units") or 0), "dimUnits": float(row.get("dim_units") or 0),
        "color": row.get("color") or "#f0ead8", "label": row.get("label") or "", "enabled": bool(row.get("enabled")),
    }


def _points(raw: Any) -> list[dict[str, float]]:
    try:
        source = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        source = []
    out: list[dict[str, float]] = []
    for point in source if isinstance(source, list) else []:
        if not isinstance(point, dict):
            continue
        try:
            out.append({"x": float(point["x"]), "y": float(point["y"])})
        except (TypeError, ValueError, KeyError):
            continue
    return out[:500]


def normalize_drawing(row: dict[str, Any]) -> dict[str, Any]:
    return {"id": row["id"], "campaignId": row["campaign_id"], "sceneId": row["scene_id"], "points": _points(row.get("points")), "color": row.get("color") or "#3fe0d0", "width": float(row.get("width") or 3), "label": row.get("label") or ""}


def normalize_pin(row: dict[str, Any]) -> dict[str, Any]:
    return {"id": row["id"], "campaignId": row["campaign_id"], "sceneId": row["scene_id"], "x": float(row.get("x") or 0), "y": float(row.get("y") or 0), "icon": (row.get("icon") or "•")[:8], "label": row.get("label") or "", "visibility": row.get("visibility") if row.get("visibility") in ("gm", "all") else "all"}


class SceneRevisionConflict(Exception):
    pass


def _require_scene_revision(conn: Any, scene_id: str, expected_revision: Any) -> int:
    try:
        expected = int(expected_revision)
    except (TypeError, ValueError):
        raise SceneRevisionConflict()
    row = conn.execute("SELECT revision FROM campaign_map_scenes WHERE id = %s", (scene_id,)).fetchone()
    current = int(row["revision"] or 0) if row else -1
    if current != expected:
        raise SceneRevisionConflict()
    return current


def normalize_prop(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "campaignId": row["campaign_id"],
        "sceneId": row["scene_id"],
        "x": float(row.get("x") or 0),
        "y": float(row.get("y") or 0),
        "w": float(row.get("w") or 32),
        "h": float(row.get("h") or 32),
        "hp": max(0.0, float(row.get("hp") or 0)),
        "hpMax": max(0.0, float(row.get("hp_max") or 0)),
        "material": row.get("material") or "wood",
        "label": row.get("label") or "",
        "color": row.get("color") or "#8a7455",
        "destroyed": max(0.0, float(row.get("hp") or 0)) <= 0,
    }


def normalize_fog(fog: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": fog["id"],
        "campaignId": fog["campaign_id"],
        "sceneId": fog["scene_id"],
        "x": float(fog.get("x") or 0),
        "y": float(fog.get("y") or 0),
        "width": float(fog.get("width") or 0),
        "height": float(fog.get("height") or 0),
        "label": fog.get("label") or "Area oculta",
    }


def normalize_ping(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "campaignId": row["campaign_id"],
        "sceneId": row["scene_id"],
        "username": row.get("username") or "",
        "x": float(row.get("x") or 0),
        "y": float(row.get("y") or 0),
        "color": row.get("color") or "#3fe0d0",
        "createdAt": row.get("created_at"),
    }


def normalize_reveal(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "campaignId": row["campaign_id"],
        "sceneId": row["scene_id"],
        "tokenId": row.get("token_id"),
        "x": float(row.get("x") or 0),
        "y": float(row.get("y") or 0),
        "radius": float(row.get("radius") or 0),
    }


def normalize_template(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "campaignId": row["campaign_id"],
        "sceneId": row["scene_id"],
        "kind": row.get("kind") or "circle",
        "x": float(row.get("x") or 0),
        "y": float(row.get("y") or 0),
        "directionDeg": float(row.get("direction_deg") or 0),
        "distanceUnits": float(row.get("distance_units") or 0),
        "angleDeg": float(row.get("angle_deg") or 53),
        "widthUnits": float(row.get("width_units") or 0),
        "color": row.get("color") or "#3fe0d0",
        "label": row.get("label") or "",
        "hidden": bool(row.get("hidden")),
        "lifecycle": row.get("lifecycle") or "manual",
        "revision": int(row.get("revision") or 0),
        "resolved": row.get("resolved_at") is not None,
        "resolvedAt": row.get("resolved_at"),
        "resolvedRound": row.get("resolved_round"),
        "ownerUsername": row.get("owner_username"),
    }


class TemplateRevisionConflict(Exception):
    pass
