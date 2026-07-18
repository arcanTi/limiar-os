"""Campaign battle-map persistence and access helpers."""

import json
import secrets
from typing import Any

from ..db import db
from ..domain.validation import sanitize_text
from ..util import slug
from . import campaign_sync
from .campaigns import is_campaign_member
from .records import get_record, get_setting


def map_update_version(campaign_id: str) -> int:
    return campaign_sync.current_version(campaign_id)


def touch_map_update(campaign_id: str) -> int:
    return campaign_sync.bump_campaign(campaign_id, "map")


def wait_for_map_update(campaign_id: str, since: int, timeout: float = 25.0) -> int:
    result = campaign_sync.wait_for_campaign_update(campaign_id, since, timeout)
    return int(result["version"])


def row_dict(row) -> dict[str, Any]:
    return dict(row) if row else {}


def is_staff(session: dict[str, str]) -> bool:
    return session.get("role") in ("admin", "gm")


def can_access_campaign(campaign_id: str, session: dict[str, str]) -> bool:
    return is_campaign_member(campaign_id, session)


def can_edit_campaign_map(_campaign_id: str, session: dict[str, str]) -> bool:
    return is_staff(session)


def default_scene_id(campaign_id: str) -> str:
    return f"{campaign_id}-default"


def ensure_default_scene(campaign_id: str) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM campaign_map_scenes WHERE campaign_id = ? AND active = 1 LIMIT 1",
            (campaign_id,),
        ).fetchone()
        if not row:
            scene_id = default_scene_id(campaign_id)
            conn.execute(
                """
                INSERT OR IGNORE INTO campaign_map_scenes(id, campaign_id, name, active)
                VALUES (?, ?, 'Cena inicial', 1)
                """,
                (scene_id, campaign_id),
            )
            conn.execute(
                "UPDATE campaign_map_scenes SET active = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE campaign_id = ?",
                (scene_id, campaign_id),
            )
            row = conn.execute(
                "SELECT * FROM campaign_map_scenes WHERE id = ?",
                (scene_id,),
            ).fetchone()
    return normalize_scene(row_dict(row))


def _parse_difficult_terrain(raw: Any) -> list[list[int]]:
    try:
        cells = json.loads(raw) if raw else []
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


EXPLORATION_MODES = ("shared", "individual")


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
        "explorationMode": scene.get("exploration_mode") if scene.get("exploration_mode") in EXPLORATION_MODES else "shared",
        "revision": int(scene.get("revision") or 0),
    }


RESOURCE_VISIBILITIES = ("gm", "owner", "party")


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


# Fase MUNICAO-NO-MAPA (G4): the token HUD shows ammo for one "primary"
# weapon so the GM doesn't have to open the cockpit to see who's dry. Gear
# items only carry `magazine`/`currentAmmo` once normalizeGearItem has run
# client-side (CM0) and the character was saved since — untouched/legacy
# gear has no `magazine`, so it's simply skipped here (advisory, same as
# combat.js's own `hasAmmo = item.magazine != null` check). Equipped wins
# ties so a holstered spare mag pistol doesn't shadow the weapon in hand.
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
        "visionDistanceUnits": float(token["vision_distance_units"]) if token.get("vision_distance_units") is not None else None,
        "rotation": float(token.get("rotation") or 0) % 360,
        "elevation": float(token.get("elevation") or 0),
        "visible": bool(token.get("visible")),
        "move": float(token["move"]) if token.get("move") is not None else None,
        "resourceVisibility": token.get("resource_visibility") or default_resource_visibility(token.get("kind") or "npc"),
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


LIGHT_KINDS = ("ambient", "token", "effect")


def normalize_light(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"], "campaignId": row["campaign_id"], "sceneId": row["scene_id"],
        "kind": row.get("kind") if row.get("kind") in LIGHT_KINDS else "ambient",
        "x": float(row.get("x") or 0), "y": float(row.get("y") or 0), "tokenId": row.get("token_id"),
        "brightUnits": float(row.get("bright_units") or 0), "dimUnits": float(row.get("dim_units") or 0),
        "color": row.get("color") or "#f0ead8", "label": row.get("label") or "", "enabled": bool(row.get("enabled")),
    }


def list_lights(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM campaign_map_lights WHERE campaign_id = ? AND scene_id = ? ORDER BY created_at, id", (campaign_id, scene_id)).fetchall()
    return [normalize_light(row_dict(row)) for row in rows]


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


def list_drawings(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM campaign_map_drawings WHERE campaign_id = ? AND scene_id = ? ORDER BY created_at, id", (campaign_id, scene_id)).fetchall()
    return [normalize_drawing(row_dict(row)) for row in rows]


def list_pins(campaign_id: str, scene_id: str, session: dict[str, str]) -> list[dict[str, Any]]:
    with db() as conn:
        where = "campaign_id = ? AND scene_id = ?" + ("" if is_staff(session) else " AND visibility = 'all'")
        rows = conn.execute(f"SELECT * FROM campaign_map_pins WHERE {where} ORDER BY created_at, id", (campaign_id, scene_id)).fetchall()
    return [normalize_pin(row_dict(row)) for row in rows]


def save_drawing(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    points = _points(payload.get("points"))
    if len(points) < 2:
        raise ValueError("drawing needs at least two points")
    for point in points:
        point["x"] = max(0.0, min(float(scene["width"]), point["x"]))
        point["y"] = max(0.0, min(float(scene["height"]), point["y"]))
    drawing_id = str(payload.get("id") or f"drawing-{secrets.token_hex(8)}")[:160]
    try:
        width = max(.5, min(30.0, float(payload.get("width") or 3)))
    except (TypeError, ValueError):
        raise ValueError("invalid drawing width")
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], payload.get("expectedRevision"))
        conn.execute("""INSERT INTO campaign_map_drawings(id,campaign_id,scene_id,points,color,width,label) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET points=excluded.points,color=excluded.color,width=excluded.width,label=excluded.label,updated_at=CURRENT_TIMESTAMP""", (drawing_id, campaign_id, scene["id"], json.dumps(points), str(payload.get("color") or "#3fe0d0")[:24], width, sanitize_text(str(payload.get("label") or ""))[:120]))
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_drawings WHERE id = ?", (drawing_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_drawing(row_dict(row)), "sceneRevision": revision + 1}


def delete_drawing(campaign_id: str, drawing_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        if not conn.execute("DELETE FROM campaign_map_drawings WHERE campaign_id = ? AND scene_id = ? AND id = ?", (campaign_id, scene["id"], drawing_id)).rowcount:
            raise ValueError("drawing not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
    touch_map_update(campaign_id)
    return {"deleted": True, "sceneRevision": revision + 1}


def save_pin(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    pin_id = str(payload.get("id") or f"pin-{secrets.token_hex(8)}")[:160]
    try:
        x = max(0.0, min(float(scene["width"]), float(payload.get("x") or 0)))
        y = max(0.0, min(float(scene["height"]), float(payload.get("y") or 0)))
    except (TypeError, ValueError):
        raise ValueError("invalid pin position")
    visibility = str(payload.get("visibility") or "all")
    if visibility not in ("gm", "all"):
        visibility = "all"
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], payload.get("expectedRevision"))
        conn.execute("""INSERT INTO campaign_map_pins(id,campaign_id,scene_id,x,y,icon,label,visibility) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET x=excluded.x,y=excluded.y,icon=excluded.icon,label=excluded.label,visibility=excluded.visibility,updated_at=CURRENT_TIMESTAMP""", (pin_id, campaign_id, scene["id"], x, y, sanitize_text(str(payload.get("icon") or "•"))[:8], sanitize_text(str(payload.get("label") or ""))[:240], visibility))
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_pins WHERE id = ?", (pin_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_pin(row_dict(row)), "sceneRevision": revision + 1}


def delete_pin(campaign_id: str, pin_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        if not conn.execute("DELETE FROM campaign_map_pins WHERE campaign_id = ? AND scene_id = ? AND id = ?", (campaign_id, scene["id"], pin_id)).rowcount:
            raise ValueError("pin not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
    touch_map_update(campaign_id)
    return {"deleted": True, "sceneRevision": revision + 1}


def save_light(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    light_id = str(payload.get("id") or f"light-{secrets.token_hex(8)}")[:160]
    kind = str(payload.get("kind") or "ambient")
    if kind not in LIGHT_KINDS:
        kind = "ambient"
    try:
        bright = max(0.0, min(200.0, float(payload.get("brightUnits") or 0)))
        dim = max(bright, min(200.0, float(payload.get("dimUnits") or bright)))
        x = max(0.0, min(float(scene["width"]), float(payload.get("x") or 0)))
        y = max(0.0, min(float(scene["height"]), float(payload.get("y") or 0)))
    except (TypeError, ValueError):
        raise ValueError("invalid light values")
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], payload.get("expectedRevision"))
        conn.execute(
            """INSERT INTO campaign_map_lights(id,campaign_id,scene_id,kind,x,y,token_id,bright_units,dim_units,color,label,enabled)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
               kind=excluded.kind,x=excluded.x,y=excluded.y,token_id=excluded.token_id,bright_units=excluded.bright_units,dim_units=excluded.dim_units,color=excluded.color,label=excluded.label,enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP""",
            (light_id, campaign_id, scene["id"], kind, x, y, str(payload.get("tokenId") or "")[:160] or None, bright, dim, str(payload.get("color") or "#f0ead8")[:24], sanitize_text(str(payload.get("label") or ""))[:120], 1 if payload.get("enabled", True) else 0),
        )
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_lights WHERE id = ?", (light_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_light(row_dict(row)), "sceneRevision": revision + 1}


def delete_light(campaign_id: str, light_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        cur = conn.execute("DELETE FROM campaign_map_lights WHERE campaign_id = ? AND scene_id = ? AND id = ?", (campaign_id, scene["id"], light_id))
        if not cur.rowcount:
            raise ValueError("light not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
    touch_map_update(campaign_id)
    return {"deleted": True, "sceneRevision": revision + 1}


def toggle_light(campaign_id: str, light_id: str, expected_revision: Any, session: dict[str, str]) -> dict[str, Any] | None:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        row = conn.execute("SELECT l.*, t.owner_username FROM campaign_map_lights l LEFT JOIN campaign_map_tokens t ON t.id = l.token_id WHERE l.campaign_id = ? AND l.scene_id = ? AND l.id = ?", (campaign_id, scene["id"], light_id)).fetchone()
        light = row_dict(row)
        if not light:
            raise ValueError("light not found")
        if not is_staff(session) and (light.get("kind") not in ("token", "effect") or light.get("owner_username") != session.get("username")):
            return None
        next_enabled = 0 if light.get("enabled") else 1
        conn.execute("UPDATE campaign_map_lights SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (next_enabled, light_id))
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
        updated = conn.execute("SELECT * FROM campaign_map_lights WHERE id = ?", (light_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_light(row_dict(updated)), "sceneRevision": revision + 1}


class SceneRevisionConflict(Exception):
    pass


def list_walls(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM campaign_map_walls WHERE campaign_id = ? AND scene_id = ? ORDER BY created_at, id", (campaign_id, scene_id)).fetchall()
    return [normalize_wall(row_dict(row)) for row in rows]


def _require_scene_revision(conn: Any, scene_id: str, expected_revision: Any) -> int:
    try:
        expected = int(expected_revision)
    except (TypeError, ValueError):
        raise SceneRevisionConflict()
    row = conn.execute("SELECT revision FROM campaign_map_scenes WHERE id = ?", (scene_id,)).fetchone()
    current = int(row["revision"] or 0) if row else -1
    if current != expected:
        raise SceneRevisionConflict()
    return current


def save_wall(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    wall_id = str(payload.get("id") or f"wall-{secrets.token_hex(8)}")[:160]
    kind = str(payload.get("kind") or "wall")
    if kind not in ("wall", "door"):
        kind = "wall"
    coords: list[float] = []
    for key, limit in (("x1", scene["width"]), ("y1", scene["height"]), ("x2", scene["width"]), ("y2", scene["height"])):
        try:
            coords.append(max(0.0, min(float(limit), float(payload.get(key)))))
        except (TypeError, ValueError):
            raise ValueError("wall coordinates required")
    if abs(coords[0] - coords[2]) + abs(coords[1] - coords[3]) < 4:
        raise ValueError("wall must have length")
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], payload.get("expectedRevision"))
        conn.execute(
            """INSERT INTO campaign_map_walls(id,campaign_id,scene_id,x1,y1,x2,y2,kind,open)
               VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
               x1=excluded.x1,y1=excluded.y1,x2=excluded.x2,y2=excluded.y2,kind=excluded.kind,open=excluded.open,updated_at=CURRENT_TIMESTAMP""",
            (wall_id, campaign_id, scene["id"], *coords, kind, 1 if kind == "door" and payload.get("open") else 0),
        )
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_walls WHERE id = ?", (wall_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_wall(row_dict(row)), "sceneRevision": revision + 1}


def delete_wall(campaign_id: str, wall_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        cur = conn.execute("DELETE FROM campaign_map_walls WHERE campaign_id = ? AND scene_id = ? AND id = ?", (campaign_id, scene["id"], wall_id))
        if not cur.rowcount:
            raise ValueError("wall not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
    touch_map_update(campaign_id)
    return {"deleted": True, "sceneRevision": revision + 1}


def toggle_door(campaign_id: str, wall_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        row = conn.execute("SELECT * FROM campaign_map_walls WHERE campaign_id = ? AND scene_id = ? AND id = ?", (campaign_id, scene["id"], wall_id)).fetchone()
        wall = row_dict(row)
        if not wall or wall.get("kind") != "door":
            raise ValueError("door not found")
        next_open = 0 if wall.get("open") else 1
        conn.execute("UPDATE campaign_map_walls SET open = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (next_open, wall_id))
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
        updated = conn.execute("SELECT * FROM campaign_map_walls WHERE id = ?", (wall_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_wall(row_dict(updated)), "sceneRevision": revision + 1}


# G2 (Fase AREA): destructible cover. Same document shape/lifecycle as walls
# above (id + scene.revision/expectedRevision, GM-only placement/removal) —
# copied deliberately rather than inventing a new persistence style. A prop
# blocks LOS while hp > 0 (frontend/src/domain/map/visionEngine.ts turns its
# rectangle into wall-like segments); once hp hits 0 it's just visual rubble,
# the client stops feeding it into vision. Attacking a prop uses normal
# damage — no armor/ablation, props aren't characters — so `damage_prop`
# is a flat HP subtraction, open to any campaign member (not GM-gated) the
# same way a player's own attack roll already applies character damage
# without a GM click.
MATERIALS = ("wood", "metal", "concrete", "glass", "improvised")


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


def list_props(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM campaign_map_props WHERE campaign_id = ? AND scene_id = ? ORDER BY created_at",
            (campaign_id, scene_id),
        ).fetchall()
    return [normalize_prop(row_dict(row)) for row in rows]


def save_prop(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    prop_id = str(payload.get("id") or f"prop-{secrets.token_hex(8)}")[:160]
    material = str(payload.get("material") or "wood")
    if material not in MATERIALS:
        material = "wood"
    w = max(4.0, min(float(scene["width"]), float(payload.get("w") or 32)))
    h = max(4.0, min(float(scene["height"]), float(payload.get("h") or 32)))
    try:
        x = max(0.0, min(float(scene["width"]), float(payload.get("x"))))
        y = max(0.0, min(float(scene["height"]), float(payload.get("y"))))
    except (TypeError, ValueError):
        raise ValueError("prop coordinates required")
    is_new = payload.get("id") is None
    with db() as conn:
        existing = conn.execute("SELECT hp FROM campaign_map_props WHERE id = ?", (prop_id,)).fetchone()
        hp_max = max(0.0, float(payload.get("hpMax") or payload.get("hp_max") or 10))
        if existing is not None and "hp" not in payload:
            hp = float(row_dict(existing)["hp"])
        else:
            hp = max(0.0, min(hp_max, float(payload.get("hp") if payload.get("hp") is not None else hp_max)))
        revision = _require_scene_revision(conn, scene["id"], payload.get("expectedRevision"))
        conn.execute(
            """INSERT INTO campaign_map_props(id,campaign_id,scene_id,x,y,w,h,hp,hp_max,material,label,color)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
               x=excluded.x,y=excluded.y,w=excluded.w,h=excluded.h,hp=excluded.hp,hp_max=excluded.hp_max,
               material=excluded.material,label=excluded.label,color=excluded.color,updated_at=CURRENT_TIMESTAMP""",
            (
                prop_id, campaign_id, scene["id"], x, y, w, h, hp, hp_max, material,
                sanitize_text(str(payload.get("label") or ""), 120),
                str(payload.get("color") or "#8a7455")[:24],
            ),
        )
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_props WHERE id = ?", (prop_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_prop(row_dict(row)), "sceneRevision": revision + 1}


def delete_prop(campaign_id: str, prop_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        cur = conn.execute("DELETE FROM campaign_map_props WHERE campaign_id = ? AND scene_id = ? AND id = ?", (campaign_id, scene["id"], prop_id))
        if not cur.rowcount:
            raise ValueError("prop not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
    touch_map_update(campaign_id)
    return {"deleted": True, "sceneRevision": revision + 1}


def damage_prop(campaign_id: str, prop_id: str, amount: Any, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    try:
        delta = max(0.0, float(amount))
    except (TypeError, ValueError):
        raise ValueError("damage amount required")
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        row = conn.execute("SELECT * FROM campaign_map_props WHERE campaign_id = ? AND scene_id = ? AND id = ?", (campaign_id, scene["id"], prop_id)).fetchone()
        prop = row_dict(row)
        if not prop:
            raise ValueError("prop not found")
        next_hp = max(0.0, float(prop.get("hp") or 0) - delta)
        conn.execute("UPDATE campaign_map_props SET hp = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (next_hp, prop_id))
        conn.execute("UPDATE campaign_map_scenes SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (revision + 1, scene["id"]))
        updated = conn.execute("SELECT * FROM campaign_map_props WHERE id = ?", (prop_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_prop(row_dict(updated)), "sceneRevision": revision + 1}


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


# Pings are ephemeral table markers (Foundry-style alt-click): any campaign
# member can drop one, everyone picks it up on the next poll. Rows older than
# 60s are pruned lazily on insert; map_state only returns the last ~10s so a
# ping animates once per client and dies on its own.
PING_VISIBLE_SECONDS = 10


def add_ping(campaign_id: str, username: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    ping_id = f"ping-{secrets.token_hex(8)}"
    with db() as conn:
        conn.execute(
            "DELETE FROM campaign_map_pings WHERE campaign_id = ? AND created_at < datetime('now', '-60 seconds')",
            (campaign_id,),
        )
        conn.execute(
            """
            INSERT INTO campaign_map_pings(id, campaign_id, scene_id, username, x, y, color)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ping_id,
                campaign_id,
                scene["id"],
                str(username or "")[:120],
                float(payload.get("x") or 0),
                float(payload.get("y") or 0),
                str(payload.get("color") or "#3fe0d0")[:24],
            ),
        )
        row = conn.execute("SELECT * FROM campaign_map_pings WHERE id = ?", (ping_id,)).fetchone()
    result = normalize_ping(row_dict(row))
    touch_map_update(campaign_id)
    return result


def recent_pings(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM campaign_map_pings
            WHERE campaign_id = ? AND scene_id = ? AND created_at >= datetime('now', ?)
            ORDER BY created_at
            """,
            (campaign_id, scene_id, f"-{PING_VISIBLE_SECONDS} seconds"),
        ).fetchall()
    return [normalize_ping(row_dict(row)) for row in rows]


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


def add_reveal(
    campaign_id: str,
    scene_id: str,
    token_id: str | None,
    x: float,
    y: float,
    radius: float,
) -> None:
    if radius <= 0:
        return
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_map_reveals(id, campaign_id, scene_id, token_id, x, y, radius)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (f"rev-{secrets.token_hex(8)}", campaign_id, scene_id, token_id, x, y, radius),
        )


# F2c: `individual` exploration mode keeps a *separate* fog-of-war memory per
# player, alongside (not instead of) the shared reveals above — switching a
# scene back to `shared` needs the shared history intact, untouched. Only
# player-owned tokens earn personal exploration; a GM-controlled NPC scouting
# ahead isn't "a player's" memory of the room.
def add_personal_reveal(
    campaign_id: str,
    scene_id: str,
    username: str,
    token_id: str | None,
    x: float,
    y: float,
    radius: float,
) -> None:
    if radius <= 0 or not username:
        return
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_map_reveals_personal(id, campaign_id, scene_id, username, token_id, x, y, radius)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (f"prev-{secrets.token_hex(8)}", campaign_id, scene_id, str(username)[:120], token_id, x, y, radius),
        )


def personal_reveals(campaign_id: str, scene_id: str, username: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM campaign_map_reveals_personal
            WHERE campaign_id = ? AND scene_id = ? AND username = ?
            ORDER BY created_at
            """,
            (campaign_id, scene_id, username),
        ).fetchall()
    return [normalize_reveal(row_dict(row)) for row in rows]


def _track_personal_reveal(campaign_id: str, scene: dict[str, Any], token: dict[str, Any], x: float, y: float, radius: float) -> None:
    if scene.get("explorationMode") != "individual" or radius <= 0:
        return
    if (token.get("kind") or "npc") != "player":
        return
    owner = token.get("owner_username") or token.get("ownerUsername")
    if not owner:
        return
    add_personal_reveal(campaign_id, str(scene["id"]), owner, token.get("id"), x, y, radius)


# F3: area-of-effect templates. Geometry (which cells a shape covers) is a
# pure client concern (domain/map/templateEngine.ts) — the server only owns
# persistence, kind/bounds validation, and the audience/ownership contract:
# GM edits or deletes any template, a player only their own; a `hidden`
# template is suppressed for everyone except its owner and staff, same shape
# as the resourceVisibility/hidden-token contracts from F2a/F2b.
TEMPLATE_KINDS = ("circle", "cone", "rectangle", "ray")
TEMPLATE_LIFECYCLES = ("manual", "untilResolved", "untilTurnEnd")


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


def _template_visible_to(row: dict[str, Any], session: dict[str, str] | None) -> bool:
    if not row.get("hidden"):
        return True
    if not session:
        return False
    return is_staff(session) or row.get("owner_username") == session.get("username")


# A resolved `untilResolved` template (grenade/AoE, Fase AREA) disappears from
# every non-GM payload immediately — the blast already happened, a player has
# no reason to keep seeing the marker. Staff keeps seeing it, dimmed by the
# client from `resolved`, for one extra combat round after the round it was
# resolved in (so the table can still eyeball "that's where it went off");
# past that window — or after a flat time cutoff for when combat isn't
# running, so a resolved template outside combat doesn't linger forever —
# the row is lazily deleted on the next list_templates call, no background
# job needed.
TEMPLATE_RESOLVED_STALE_SECONDS = 600


def _prune_resolved_templates(conn: Any, campaign_id: str, scene_id: str, combat: dict[str, Any]) -> None:
    active = 1 if combat.get("active") else 0
    cur = conn.execute(
        """
        DELETE FROM campaign_map_templates
        WHERE campaign_id = ? AND scene_id = ? AND resolved_at IS NOT NULL
          AND (
            (? = 1 AND resolved_round IS NOT NULL AND ? > resolved_round + 1)
            OR ((? = 0 OR resolved_round IS NULL) AND resolved_at <= datetime('now', ?))
          )
        """,
        (
            campaign_id,
            scene_id,
            active,
            combat.get("roundNumber") or 0,
            active,
            f"-{TEMPLATE_RESOLVED_STALE_SECONDS} seconds",
        ),
    )
    if cur.rowcount:
        touch_map_update(campaign_id)


def list_templates(campaign_id: str, scene_id: str, session: dict[str, str] | None = None) -> list[dict[str, Any]]:
    combat = _combat_summary()
    with db() as conn:
        _prune_resolved_templates(conn, campaign_id, scene_id, combat)
        rows = conn.execute(
            "SELECT * FROM campaign_map_templates WHERE campaign_id = ? AND scene_id = ? ORDER BY created_at",
            (campaign_id, scene_id),
        ).fetchall()
    dicts = [row_dict(row) for row in rows]
    staff = is_staff(session) if session else False
    visible = [row for row in dicts if _template_visible_to(row, session) and (staff or row.get("resolved_at") is None)]
    return [normalize_template(row) for row in visible]


def save_template(campaign_id: str, payload: dict[str, Any], session: dict[str, str]) -> dict[str, Any] | None:
    scene = active_scene(campaign_id)
    template_id = str(payload.get("id") or f"tpl-{secrets.token_hex(8)}")
    with db() as conn:
        existing = conn.execute(
            "SELECT owner_username FROM campaign_map_templates WHERE id = ? AND campaign_id = ?",
            (template_id, campaign_id),
        ).fetchone()
    if existing and not is_staff(session) and row_dict(existing).get("owner_username") != session["username"]:
        return None

    kind = str(payload.get("kind") or "circle")
    if kind not in TEMPLATE_KINDS:
        kind = "circle"
    lifecycle = str(payload.get("lifecycle") or "manual")
    if lifecycle not in TEMPLATE_LIFECYCLES:
        lifecycle = "manual"

    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_map_templates(
              id, campaign_id, scene_id, kind, x, y, direction_deg, distance_units,
              angle_deg, width_units, color, label, hidden, lifecycle, owner_username
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              kind = excluded.kind,
              x = excluded.x,
              y = excluded.y,
              direction_deg = excluded.direction_deg,
              distance_units = excluded.distance_units,
              angle_deg = excluded.angle_deg,
              width_units = excluded.width_units,
              color = excluded.color,
              label = excluded.label,
              hidden = excluded.hidden,
              lifecycle = excluded.lifecycle,
              revision = campaign_map_templates.revision + 1,
              updated_at = CURRENT_TIMESTAMP
            """,
            (
                template_id,
                campaign_id,
                scene["id"],
                kind,
                float(payload.get("x") or 0),
                float(payload.get("y") or 0),
                float(payload.get("directionDeg") or 0) % 360,
                max(0, min(100, float(payload.get("distanceUnits") or 0))),
                max(1, min(360, float(payload["angleDeg"]) if payload.get("angleDeg") is not None else 53)),
                max(0, min(100, float(payload.get("widthUnits") or 0))),
                str(payload.get("color") or "#3fe0d0")[:24],
                sanitize_text(str(payload.get("label") or ""), 120),
                1 if payload.get("hidden") else 0,
                lifecycle,
                session["username"],
            ),
        )
        row = conn.execute("SELECT * FROM campaign_map_templates WHERE id = ?", (template_id,)).fetchone()
    result = normalize_template(row_dict(row))
    touch_map_update(campaign_id)
    return result


def delete_template(campaign_id: str, template_id: str, session: dict[str, str]) -> bool | None:
    """True: deleted. False: no such template. None: exists but caller isn't
    the owner or staff — the route maps that to 403."""
    with db() as conn:
        row = conn.execute(
            "SELECT owner_username FROM campaign_map_templates WHERE id = ? AND campaign_id = ?",
            (template_id, campaign_id),
        ).fetchone()
        if not row:
            return False
        if not is_staff(session) and row_dict(row).get("owner_username") != session["username"]:
            return None
        cur = conn.execute(
            "DELETE FROM campaign_map_templates WHERE campaign_id = ? AND id = ?",
            (campaign_id, template_id),
        )
    if cur.rowcount:
        touch_map_update(campaign_id)
    return cur.rowcount > 0


class TemplateRevisionConflict(Exception):
    pass


# Fase AREA: "resolving" a template (grenade/AoE with lifecycle
# `untilResolved`) is just this state transition — no new damage route. The
# cockpit applies the actual HP/armor consequences through the existing
# character routes (ApplyCombatDamage / applyCharacterPatch); this call only
# marks the template consumed so it stops offering RESOLVER again and starts
# aging out of both audiences per `_template_stale`/`_prune_resolved_templates`.
# `expected_revision` guards the second-confirmation window against a double
# resolve (two clients racing the same RESOLVER click).
def resolve_template(campaign_id: str, template_id: str, expected_revision: Any, session: dict[str, str]) -> dict[str, Any] | None:
    """None: not found or caller isn't the owner/staff — route maps that to 403/404."""
    combat = _combat_summary()
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM campaign_map_templates WHERE id = ? AND campaign_id = ?",
            (template_id, campaign_id),
        ).fetchone()
        if not row:
            return None
        current = row_dict(row)
        if not is_staff(session) and current.get("owner_username") != session.get("username"):
            return None
        try:
            expected = int(expected_revision)
        except (TypeError, ValueError):
            raise TemplateRevisionConflict()
        if expected != int(current.get("revision") or 0):
            raise TemplateRevisionConflict()
        conn.execute(
            """
            UPDATE campaign_map_templates
            SET resolved_at = CURRENT_TIMESTAMP, resolved_round = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (combat["roundNumber"], template_id),
        )
        updated = conn.execute("SELECT * FROM campaign_map_templates WHERE id = ?", (template_id,)).fetchone()
    touch_map_update(campaign_id)
    return normalize_template(row_dict(updated))


def list_scenes(campaign_id: str) -> list[dict[str, Any]]:
    ensure_default_scene(campaign_id)
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM campaign_map_scenes WHERE campaign_id = ? ORDER BY active DESC, updated_at DESC, name",
            (campaign_id,),
        ).fetchall()
    return [normalize_scene(row_dict(row)) for row in rows]


def active_scene(campaign_id: str) -> dict[str, Any]:
    return ensure_default_scene(campaign_id)


# CM1 (PLANO-COMBATE-MAPA.md): minimal combat summary so the map can
# highlight whose turn it is without a parallel fetch. Combat state is a
# single global setting (not scoped per campaign — matches the existing
# combat tracker, backend/api/state.py), so there's nothing to filter by
# campaign_id here. turnCharacterId is already non-secret: the shared combat
# page's own GET route (`_get_combat_state`) has no staff/session gate at
# all, so any authenticated session can already read the full order —
# exposing it here again introduces no new leak, GM-secret or otherwise.
def _combat_summary() -> dict[str, Any]:
    state = get_setting("combat-state") or {}
    order = state.get("order") if isinstance(state.get("order"), list) else []
    combatants = state.get("combatants") if isinstance(state.get("combatants"), dict) else {}
    turn_index = state.get("turnIndex") if isinstance(state.get("turnIndex"), int) else -1
    current_id = order[turn_index] if 0 <= turn_index < len(order) else None
    entry = combatants.get(current_id) if isinstance(combatants, dict) else None
    turn_character_id = current_id if isinstance(entry, dict) and not entry.get("defeated") else None
    return {
        "active": bool(state.get("active")),
        "roundNumber": max(0, int(state.get("round") or 0)),
        "turnCharacterId": turn_character_id,
    }


def map_state(campaign_id: str, session: dict[str, str]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    scene_id = str(scene["id"])
    staff = is_staff(session)
    with db() as conn:
        tokens = conn.execute(
            "SELECT * FROM campaign_map_tokens WHERE campaign_id = ? AND scene_id = ? ORDER BY kind, name",
            (campaign_id, scene_id),
        ).fetchall()
        fog = conn.execute(
            "SELECT * FROM campaign_map_fog WHERE campaign_id = ? AND scene_id = ? ORDER BY created_at",
            (campaign_id, scene_id),
        ).fetchall()
        reveals = conn.execute(
            "SELECT * FROM campaign_map_reveals WHERE campaign_id = ? AND scene_id = ? ORDER BY created_at",
            (campaign_id, scene_id),
        ).fetchall()
    # A GM-secret token (visible=false) never reaches a non-staff payload —
    # this is real suppression, not a client-side hide the player could
    # inspect around.
    token_rows = [row_dict(row) for row in tokens]
    if not staff:
        token_rows = [row for row in token_rows if row.get("visible")]
    characters = {
        cid: get_record("characters", cid)
        for cid in {row["character_id"] for row in token_rows if row.get("character_id")}
    }
    # F2c: `individual` exploration mode gives each non-staff viewer their own
    # fog-of-war memory instead of the campaign-wide shared one. Staff always
    # gets the full shared history — the GM invariant ("ve tudo") never
    # depends on exploration mode.
    if staff or scene.get("explorationMode") != "individual":
        reveals_out = [normalize_reveal(row_dict(row)) for row in reveals]
    else:
        reveals_out = personal_reveals(campaign_id, scene_id, session["username"])
    return {
        "scene": scene,
        "scenes": list_scenes(campaign_id),
        "tokens": [normalize_token(row, session, characters.get(row.get("character_id") or "")) for row in token_rows],
        "fogAreas": [normalize_fog(row_dict(row)) for row in fog],
        "reveals": reveals_out,
        "templates": list_templates(campaign_id, scene_id, session),
        "walls": list_walls(campaign_id, scene_id),
        "props": list_props(campaign_id, scene_id),
        "lights": list_lights(campaign_id, scene_id),
        "drawings": list_drawings(campaign_id, scene_id),
        "pins": list_pins(campaign_id, scene_id, session),
        "pings": recent_pings(campaign_id, scene_id),
        "canEdit": staff,
        "username": session["username"],
        "mapVersion": map_update_version(campaign_id),
        "combat": _combat_summary(),
    }


def save_scene(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    name = str(payload.get("name") or "Cena").strip()[:120]
    scene_id = str(payload.get("id") or f"{campaign_id}-{slug(name)}")[:160]
    fit = str(payload.get("backgroundFit") or payload.get("background_fit") or "contain")
    if fit not in ("contain", "cover", "native", "stretch"):
        fit = "contain"
    width = max(320, min(12000, int(float(payload.get("width") or 1600))))
    height = max(240, min(12000, int(float(payload.get("height") or 1000))))
    grid = max(16, min(240, int(float(payload.get("gridSize") or payload.get("grid_size") or 64))))
    fog_enabled = 1 if payload.get("fogEnabled", True) else 0
    shadow_opacity = max(0, min(1, float(payload.get("shadowOpacity") or 0.92)))
    darkness = max(0, min(1, float(payload.get("darkness") or 0)))
    exploration_mode = str(payload.get("explorationMode") or "")
    if exploration_mode not in EXPLORATION_MODES:
        # Preserve whatever the scene already has (e.g. a save from a form
        # that doesn't carry this field) instead of silently resetting an
        # `individual` scene back to `shared`.
        exploration_mode = get_scene(scene_id).get("explorationMode") or "shared"
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_map_scenes(
              id, campaign_id, name, background, background_fit, width, height,
              grid_size, fog_enabled, shadow_opacity, darkness, exploration_mode, active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT active FROM campaign_map_scenes WHERE id = ?), 0))
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              background = excluded.background,
              background_fit = excluded.background_fit,
              width = excluded.width,
              height = excluded.height,
              grid_size = excluded.grid_size,
              fog_enabled = excluded.fog_enabled,
              shadow_opacity = excluded.shadow_opacity,
              darkness = excluded.darkness,
              exploration_mode = excluded.exploration_mode,
              updated_at = CURRENT_TIMESTAMP
            """,
            (
                scene_id,
                campaign_id,
                name,
                str(payload.get("background") or "")[:1000],
                fit,
                width,
                height,
                grid,
                fog_enabled,
                shadow_opacity,
                darkness,
                exploration_mode,
                scene_id,
            ),
        )
        active_count = conn.execute(
            "SELECT COUNT(*) FROM campaign_map_scenes WHERE campaign_id = ? AND active = 1",
            (campaign_id,),
        ).fetchone()[0]
        if active_count == 0:
            conn.execute("UPDATE campaign_map_scenes SET active = 1 WHERE id = ?", (scene_id,))
        if payload.get("activate"):
            conn.execute(
                "UPDATE campaign_map_scenes SET active = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE campaign_id = ?",
                (scene_id, campaign_id),
            )
    touch_map_update(campaign_id)
    return active_scene(campaign_id) if payload.get("activate") else get_scene(scene_id)


def get_scene(scene_id: str) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute("SELECT * FROM campaign_map_scenes WHERE id = ?", (scene_id,)).fetchone()
    return normalize_scene(row_dict(row))


def activate_scene(campaign_id: str, scene_id: str) -> dict[str, Any]:
    with db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM campaign_map_scenes WHERE campaign_id = ? AND id = ?",
            (campaign_id, scene_id),
        ).fetchone()
        if not exists:
            return {}
        conn.execute(
            "UPDATE campaign_map_scenes SET active = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE campaign_id = ?",
            (scene_id, campaign_id),
        )
    touch_map_update(campaign_id)
    return active_scene(campaign_id)


def _character_hp(character: dict[str, Any]) -> tuple[int | None, int | None]:
    health = character.get("health") if isinstance(character.get("health"), dict) else {}
    cur = health.get("cur") if isinstance(health, dict) else None
    max_hp = health.get("max") if isinstance(health, dict) else None
    try:
        return (int(cur) if cur is not None else None, int(max_hp) if max_hp is not None else None)
    except (TypeError, ValueError):
        return None, None


def upsert_token(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    token_id = str(payload.get("id") or f"tok-{secrets.token_hex(8)}")
    character_id = str(payload.get("characterId") or payload.get("character_id") or "").strip() or None
    kind = str(payload.get("kind") or ("player" if character_id else "npc"))
    if kind not in ("player", "npc", "marker"):
        kind = "npc"
    resource_visibility = str(payload.get("resourceVisibility") or "")
    if resource_visibility not in RESOURCE_VISIBILITIES:
        resource_visibility = default_resource_visibility(kind)
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_map_tokens(
              id, campaign_id, scene_id, character_id, name, kind, owner_username,
              x, y, size, color, image, hp, hp_max, vision, vision_distance_units, rotation, elevation, visible, move, resource_visibility
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              character_id = excluded.character_id,
              name = excluded.name,
              kind = excluded.kind,
              owner_username = excluded.owner_username,
              x = excluded.x,
              y = excluded.y,
              size = excluded.size,
              color = excluded.color,
              image = excluded.image,
              hp = excluded.hp,
              hp_max = excluded.hp_max,
              vision = excluded.vision,
              vision_distance_units = excluded.vision_distance_units,
              rotation = excluded.rotation,
              elevation = excluded.elevation,
              visible = excluded.visible,
              move = excluded.move,
              resource_visibility = excluded.resource_visibility,
              updated_at = CURRENT_TIMESTAMP
            """,
            (
                token_id,
                campaign_id,
                scene["id"],
                character_id,
                str(payload.get("name") or "Token")[:120],
                kind,
                str(payload.get("ownerUsername") or payload.get("owner_username") or "")[:120] or None,
                float(payload.get("x") or 120),
                float(payload.get("y") or 120),
                max(0.35, min(4, float(payload.get("size") or 1))),
                str(payload.get("color") or "#d6aa4e")[:24],
                str(payload.get("image") or "")[:1000],
                payload.get("hp"),
                payload.get("hpMax") or payload.get("hp_max"),
                max(0, min(2000, int(float(payload.get("vision") or 240)))),
                max(0, min(200, float(payload["visionDistanceUnits"]))) if payload.get("visionDistanceUnits") not in (None, "") else None,
                float(payload.get("rotation") or 0) % 360,
                max(-1000, min(1000, float(payload.get("elevation") or 0))),
                1 if payload.get("visible", True) else 0,
                max(0, min(20, float(payload["move"]))) if payload.get("move") not in (None, "") else None,
                resource_visibility,
            ),
        )
        row = conn.execute("SELECT * FROM campaign_map_tokens WHERE id = ?", (token_id,)).fetchone()
    token = normalize_token(row_dict(row))
    radius = vision_radius_px(row_dict(row), scene)
    add_reveal(campaign_id, str(scene["id"]), token_id, token["x"], token["y"], radius)
    _track_personal_reveal(campaign_id, scene, token, token["x"], token["y"], radius)
    touch_map_update(campaign_id)
    return token


def move_token(campaign_id: str, token_id: str, x: float, y: float, session: dict[str, str]) -> bool:
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM campaign_map_tokens WHERE campaign_id = ? AND id = ?",
            (campaign_id, token_id),
        ).fetchone()
        if not row:
            return False
        token = row_dict(row)
        if not is_staff(session) and token.get("owner_username") != session["username"]:
            return False
        conn.execute(
            "UPDATE campaign_map_tokens SET x = ?, y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (float(x), float(y), token_id),
        )
        scene = get_scene(str(token.get("scene_id")))
        vision = vision_radius_px(token, scene)
        if vision > 0:
            conn.execute(
                """
                INSERT INTO campaign_map_reveals(id, campaign_id, scene_id, token_id, x, y, radius)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"rev-{secrets.token_hex(8)}",
                    campaign_id,
                    token.get("scene_id"),
                    token_id,
                    float(x),
                    float(y),
                    vision,
                ),
            )
    if vision > 0:
        scene = get_scene(str(token.get("scene_id")))
        _track_personal_reveal(campaign_id, scene, token, float(x), float(y), vision)
    touch_map_update(campaign_id)
    return True


def move_tokens(campaign_id: str, moves: Any, session: dict[str, str]) -> bool:
    """GM-only atomic group move. Individual player movement remains on the
    narrower endpoint above, so selecting one token never broadens authority."""
    if not is_staff(session) or not isinstance(moves, list) or not moves or len(moves) > 100:
        return False
    updates: list[tuple[str, float, float]] = []
    for move in moves:
        if not isinstance(move, dict) or not move.get("tokenId"):
            return False
        try:
            updates.append((str(move["tokenId"]), float(move["x"]), float(move["y"])))
        except (TypeError, ValueError):
            return False
    with db() as conn:
        rows = [row_dict(conn.execute("SELECT * FROM campaign_map_tokens WHERE campaign_id = ? AND id = ?", (campaign_id, token_id)).fetchone()) for token_id, _, _ in updates]
        if any(not row for row in rows) or len({row["scene_id"] for row in rows}) != 1:
            return False
        scene = get_scene(str(rows[0]["scene_id"]))
        for row, (_, x, y) in zip(rows, updates):
            conn.execute("UPDATE campaign_map_tokens SET x = ?, y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (x, y, row["id"]))
            radius = vision_radius_px(row, scene)
            if radius > 0:
                conn.execute("INSERT INTO campaign_map_reveals(id,campaign_id,scene_id,token_id,x,y,radius) VALUES(?,?,?,?,?,?,?)", (f"rev-{secrets.token_hex(8)}", campaign_id, row["scene_id"], row["id"], x, y, radius))
    for row, (_, x, y) in zip(rows, updates):
        radius = vision_radius_px(row, scene)
        if radius > 0:
            _track_personal_reveal(campaign_id, scene, normalize_token(row), x, y, radius)
    touch_map_update(campaign_id)
    return True


def delete_token(campaign_id: str, token_id: str) -> bool:
    # A reveal is exploration owned by the token that earned it — once the
    # token is gone nothing can ever see or clear it again, so it just sits
    # in the DB forever clearing fog nobody asked for (README-MAPA B5). GC it
    # alongside the token rather than leaving it as a silent leak.
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_map_tokens WHERE campaign_id = ? AND id = ?",
            (campaign_id, token_id),
        )
        if cur.rowcount:
            conn.execute(
                "DELETE FROM campaign_map_reveals WHERE campaign_id = ? AND token_id = ?",
                (campaign_id, token_id),
            )
            conn.execute(
                "DELETE FROM campaign_map_reveals_personal WHERE campaign_id = ? AND token_id = ?",
                (campaign_id, token_id),
            )
    if cur.rowcount:
        touch_map_update(campaign_id)
    return cur.rowcount > 0


def toggle_difficult_terrain(campaign_id: str, grid_x: int, grid_y: int) -> dict[str, Any]:
    """Toggle one grid cell (integer cell coords, not pixels) of difficult
    terrain on the campaign's active scene. Painting is click/drag per-cell
    on the map tool, same spirit as the manual fog rectangles."""
    scene = active_scene(campaign_id)
    with db() as conn:
        row = conn.execute(
            "SELECT difficult_terrain FROM campaign_map_scenes WHERE id = ?",
            (scene["id"],),
        ).fetchone()
        cells = _parse_difficult_terrain(row_dict(row).get("difficult_terrain") if row else None)
        cell = [int(grid_x), int(grid_y)]
        if cell in cells:
            cells = [c for c in cells if c != cell]
        else:
            cells.append(cell)
        conn.execute(
            "UPDATE campaign_map_scenes SET difficult_terrain = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (json.dumps(cells), scene["id"]),
        )
    touch_map_update(campaign_id)
    return get_scene(str(scene["id"]))


def clear_difficult_terrain(campaign_id: str) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        conn.execute(
            "UPDATE campaign_map_scenes SET difficult_terrain = '[]', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (scene["id"],),
        )
    touch_map_update(campaign_id)
    return get_scene(str(scene["id"]))


def add_fog(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    fog_id = str(payload.get("id") or f"fog-{secrets.token_hex(8)}")
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_map_fog(id, campaign_id, scene_id, x, y, width, height, label)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fog_id,
                campaign_id,
                scene["id"],
                float(payload.get("x") or 0),
                float(payload.get("y") or 0),
                float(payload.get("width") or 0),
                float(payload.get("height") or 0),
                str(payload.get("label") or "Area oculta")[:120],
            ),
        )
        row = conn.execute("SELECT * FROM campaign_map_fog WHERE id = ?", (fog_id,)).fetchone()
    result = normalize_fog(row_dict(row))
    touch_map_update(campaign_id)
    return result


def delete_fog(campaign_id: str, fog_id: str) -> bool:
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_map_fog WHERE campaign_id = ? AND id = ?",
            (campaign_id, fog_id),
        )
    if cur.rowcount:
        touch_map_update(campaign_id)
    return cur.rowcount > 0


def clear_reveals(campaign_id: str) -> bool:
    scene = active_scene(campaign_id)
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_map_reveals WHERE campaign_id = ? AND scene_id = ?",
            (campaign_id, scene["id"]),
        )
        cur_personal = conn.execute(
            "DELETE FROM campaign_map_reveals_personal WHERE campaign_id = ? AND scene_id = ?",
            (campaign_id, scene["id"]),
        )
    changed = cur.rowcount > 0 or cur_personal.rowcount > 0
    if changed:
        touch_map_update(campaign_id)
    return changed


def sync_player_tokens(campaign_id: str) -> int:
    scene = active_scene(campaign_id)
    personal_writes: list[tuple[str, str, float, float, float]] = []
    with db() as conn:
        rows = conn.execute(
            "SELECT username, character_id FROM campaign_members WHERE campaign_id = ? ORDER BY username",
            (campaign_id,),
        ).fetchall()
        count = 0
        for idx, row in enumerate(rows):
            character = get_record("characters", row["character_id"]) or {}
            hp, hp_max = _character_hp(character)
            token_id = f"{campaign_id}-{scene['id']}-{row['character_id']}"
            conn.execute(
                """
                INSERT INTO campaign_map_tokens(
                  id, campaign_id, scene_id, character_id, name, kind, owner_username,
                  x, y, size, color, image, hp, hp_max, vision, visible
                )
                VALUES (?, ?, ?, ?, ?, 'player', ?, ?, ?, 1, ?, ?, ?, ?, 260, 1)
                ON CONFLICT(campaign_id, scene_id, character_id) DO UPDATE SET
                  name = excluded.name,
                  owner_username = excluded.owner_username,
                  image = CASE WHEN campaign_map_tokens.image IS NULL OR campaign_map_tokens.image = '' THEN excluded.image ELSE campaign_map_tokens.image END,
                  hp = excluded.hp,
                  hp_max = excluded.hp_max,
                  updated_at = CURRENT_TIMESTAMP
                """,
                (
                    token_id,
                    campaign_id,
                    scene["id"],
                    row["character_id"],
                    str(character.get("name") or row["character_id"])[:120],
                    row["username"],
                    140 + (idx % 5) * 72,
                    140 + (idx // 5) * 72,
                    "#3fe0d0",
                    str(character.get("portraitUrl") or "")[:1000],
                    hp,
                    hp_max,
                ),
            )
            hp_reveal = conn.execute(
                "SELECT x, y, vision FROM campaign_map_tokens WHERE id = ?",
                (token_id,),
            ).fetchone()
            if hp_reveal and float(hp_reveal["vision"] or 0) > 0:
                conn.execute(
                    """
                    INSERT INTO campaign_map_reveals(id, campaign_id, scene_id, token_id, x, y, radius)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        f"rev-{secrets.token_hex(8)}",
                        campaign_id,
                        scene["id"],
                        token_id,
                        hp_reveal["x"],
                        hp_reveal["y"],
                        hp_reveal["vision"],
                    ),
                )
                personal_writes.append((token_id, row["username"], hp_reveal["x"], hp_reveal["y"], hp_reveal["vision"]))
            count += 1
    for token_id, username, x, y, radius in personal_writes:
        _track_personal_reveal(campaign_id, scene, {"kind": "player", "owner_username": username, "id": token_id}, x, y, radius)
    touch_map_update(campaign_id)
    return count
