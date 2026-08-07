"""Walls, lights, drawings, pins, and props aggregate persistence."""

import json
import secrets
from typing import Any

from ..db import db
from ..domain.validation import sanitize_text
from .campaign_map_common import (
    LIGHT_KINDS,
    _points,
    _require_scene_revision,
    is_staff,
    normalize_drawing,
    normalize_light,
    normalize_pin,
    normalize_prop,
    normalize_wall,
    row_dict,
    touch_map_update,
)
from .campaign_map_scenes import active_scene

MATERIALS = ("wood", "metal", "concrete", "glass", "improvised")

def list_lights(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM campaign_map_lights WHERE campaign_id = %s AND scene_id = %s ORDER BY created_at, id", (campaign_id, scene_id)).fetchall()
    return [normalize_light(row_dict(row)) for row in rows]


def list_drawings(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM campaign_map_drawings WHERE campaign_id = %s AND scene_id = %s ORDER BY created_at, id", (campaign_id, scene_id)).fetchall()
    return [normalize_drawing(row_dict(row)) for row in rows]


def list_pins(campaign_id: str, scene_id: str, session: dict[str, str]) -> list[dict[str, Any]]:
    with db() as conn:
        where = "campaign_id = %s AND scene_id = %s" + ("" if is_staff(session) else " AND visibility = 'all'")
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
        conn.execute("""INSERT INTO campaign_map_drawings(id,campaign_id,scene_id,points,color,width,label) VALUES(%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET points=excluded.points,color=excluded.color,width=excluded.width,label=excluded.label,updated_at=CURRENT_TIMESTAMP""", (drawing_id, campaign_id, scene["id"], json.dumps(points), str(payload.get("color") or "#3fe0d0")[:24], width, sanitize_text(str(payload.get("label") or ""))[:120]))
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_drawings WHERE id = %s", (drawing_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_drawing(row_dict(row)), "sceneRevision": revision + 1}


def delete_drawing(campaign_id: str, drawing_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        if not conn.execute("DELETE FROM campaign_map_drawings WHERE campaign_id = %s AND scene_id = %s AND id = %s", (campaign_id, scene["id"], drawing_id)).rowcount:
            raise ValueError("drawing not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
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
        conn.execute("""INSERT INTO campaign_map_pins(id,campaign_id,scene_id,x,y,icon,label,visibility) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET x=excluded.x,y=excluded.y,icon=excluded.icon,label=excluded.label,visibility=excluded.visibility,updated_at=CURRENT_TIMESTAMP""", (pin_id, campaign_id, scene["id"], x, y, sanitize_text(str(payload.get("icon") or "•"))[:8], sanitize_text(str(payload.get("label") or ""))[:240], visibility))
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_pins WHERE id = %s", (pin_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_pin(row_dict(row)), "sceneRevision": revision + 1}


def delete_pin(campaign_id: str, pin_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        if not conn.execute("DELETE FROM campaign_map_pins WHERE campaign_id = %s AND scene_id = %s AND id = %s", (campaign_id, scene["id"], pin_id)).rowcount:
            raise ValueError("pin not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
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
               VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET
               kind=excluded.kind,x=excluded.x,y=excluded.y,token_id=excluded.token_id,bright_units=excluded.bright_units,dim_units=excluded.dim_units,color=excluded.color,label=excluded.label,enabled=excluded.enabled,updated_at=CURRENT_TIMESTAMP""",
            (light_id, campaign_id, scene["id"], kind, x, y, str(payload.get("tokenId") or "")[:160] or None, bright, dim, str(payload.get("color") or "#f0ead8")[:24], sanitize_text(str(payload.get("label") or ""))[:120], 1 if payload.get("enabled", True) else 0),
        )
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_lights WHERE id = %s", (light_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_light(row_dict(row)), "sceneRevision": revision + 1}


def delete_light(campaign_id: str, light_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        cur = conn.execute("DELETE FROM campaign_map_lights WHERE campaign_id = %s AND scene_id = %s AND id = %s", (campaign_id, scene["id"], light_id))
        if not cur.rowcount:
            raise ValueError("light not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
    touch_map_update(campaign_id)
    return {"deleted": True, "sceneRevision": revision + 1}


def toggle_light(campaign_id: str, light_id: str, expected_revision: Any, session: dict[str, str]) -> dict[str, Any] | None:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        row = conn.execute("SELECT l.*, t.owner_username FROM campaign_map_lights l LEFT JOIN campaign_map_tokens t ON t.id = l.token_id WHERE l.campaign_id = %s AND l.scene_id = %s AND l.id = %s", (campaign_id, scene["id"], light_id)).fetchone()
        light = row_dict(row)
        if not light:
            raise ValueError("light not found")
        if not is_staff(session) and (light.get("kind") not in ("token", "effect") or light.get("owner_username") != session.get("username")):
            return None
        next_enabled = 0 if light.get("enabled") else 1
        conn.execute("UPDATE campaign_map_lights SET enabled = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (next_enabled, light_id))
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
        updated = conn.execute("SELECT * FROM campaign_map_lights WHERE id = %s", (light_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_light(row_dict(updated)), "sceneRevision": revision + 1}


def list_walls(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute("SELECT * FROM campaign_map_walls WHERE campaign_id = %s AND scene_id = %s ORDER BY created_at, id", (campaign_id, scene_id)).fetchall()
    return [normalize_wall(row_dict(row)) for row in rows]


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
               VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET
               x1=excluded.x1,y1=excluded.y1,x2=excluded.x2,y2=excluded.y2,kind=excluded.kind,open=excluded.open,updated_at=CURRENT_TIMESTAMP""",
            (wall_id, campaign_id, scene["id"], *coords, kind, 1 if kind == "door" and payload.get("open") else 0),
        )
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_walls WHERE id = %s", (wall_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_wall(row_dict(row)), "sceneRevision": revision + 1}


def delete_wall(campaign_id: str, wall_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        cur = conn.execute("DELETE FROM campaign_map_walls WHERE campaign_id = %s AND scene_id = %s AND id = %s", (campaign_id, scene["id"], wall_id))
        if not cur.rowcount:
            raise ValueError("wall not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
    touch_map_update(campaign_id)
    return {"deleted": True, "sceneRevision": revision + 1}


def toggle_door(campaign_id: str, wall_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        row = conn.execute("SELECT * FROM campaign_map_walls WHERE campaign_id = %s AND scene_id = %s AND id = %s", (campaign_id, scene["id"], wall_id)).fetchone()
        wall = row_dict(row)
        if not wall or wall.get("kind") != "door":
            raise ValueError("door not found")
        next_open = 0 if wall.get("open") else 1
        conn.execute("UPDATE campaign_map_walls SET open = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (next_open, wall_id))
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
        updated = conn.execute("SELECT * FROM campaign_map_walls WHERE id = %s", (wall_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_wall(row_dict(updated)), "sceneRevision": revision + 1}


def list_props(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM campaign_map_props WHERE campaign_id = %s AND scene_id = %s ORDER BY created_at",
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
        existing = conn.execute("SELECT hp FROM campaign_map_props WHERE id = %s", (prop_id,)).fetchone()
        hp_max = max(0.0, float(payload.get("hpMax") or payload.get("hp_max") or 10))
        if existing is not None and "hp" not in payload:
            hp = float(row_dict(existing)["hp"])
        else:
            hp = max(0.0, min(hp_max, float(payload.get("hp") if payload.get("hp") is not None else hp_max)))
        revision = _require_scene_revision(conn, scene["id"], payload.get("expectedRevision"))
        conn.execute(
            """INSERT INTO campaign_map_props(id,campaign_id,scene_id,x,y,w,h,hp,hp_max,material,label,color)
               VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET
               x=excluded.x,y=excluded.y,w=excluded.w,h=excluded.h,hp=excluded.hp,hp_max=excluded.hp_max,
               material=excluded.material,label=excluded.label,color=excluded.color,updated_at=CURRENT_TIMESTAMP""",
            (
                prop_id, campaign_id, scene["id"], x, y, w, h, hp, hp_max, material,
                sanitize_text(str(payload.get("label") or ""), 120),
                str(payload.get("color") or "#8a7455")[:24],
            ),
        )
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
        row = conn.execute("SELECT * FROM campaign_map_props WHERE id = %s", (prop_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_prop(row_dict(row)), "sceneRevision": revision + 1}


def delete_prop(campaign_id: str, prop_id: str, expected_revision: Any) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        revision = _require_scene_revision(conn, scene["id"], expected_revision)
        cur = conn.execute("DELETE FROM campaign_map_props WHERE campaign_id = %s AND scene_id = %s AND id = %s", (campaign_id, scene["id"], prop_id))
        if not cur.rowcount:
            raise ValueError("prop not found")
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
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
        row = conn.execute("SELECT * FROM campaign_map_props WHERE campaign_id = %s AND scene_id = %s AND id = %s", (campaign_id, scene["id"], prop_id)).fetchone()
        prop = row_dict(row)
        if not prop:
            raise ValueError("prop not found")
        next_hp = max(0.0, float(prop.get("hp") or 0) - delta)
        conn.execute("UPDATE campaign_map_props SET hp = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (next_hp, prop_id))
        conn.execute("UPDATE campaign_map_scenes SET revision = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (revision + 1, scene["id"]))
        updated = conn.execute("SELECT * FROM campaign_map_props WHERE id = %s", (prop_id,)).fetchone()
    touch_map_update(campaign_id)
    return {**normalize_prop(row_dict(updated)), "sceneRevision": revision + 1}
