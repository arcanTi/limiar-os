"""Scene aggregate persistence, activation, and terrain configuration."""

import json
from typing import Any

from ..db import db
from ..domain.validation import sanitize_text
from ..util import slug
from .campaign_map_common import (
    EXPLORATION_MODES,
    _parse_difficult_terrain,
    normalize_scene,
    row_dict,
    touch_map_update,
)


def default_scene_id(campaign_id: str) -> str:
    return f"{campaign_id}-default"


def ensure_default_scene(campaign_id: str) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM campaign_map_scenes WHERE campaign_id = %s AND active = 1 LIMIT 1",
            (campaign_id,),
        ).fetchone()
        if not row:
            scene_id = default_scene_id(campaign_id)
            conn.execute(
                """
                INSERT INTO campaign_map_scenes(id, campaign_id, name, active)
                VALUES (%s, %s, 'Cena inicial', 1)
                ON CONFLICT DO NOTHING
                """,
                (scene_id, campaign_id),
            )
            conn.execute(
                "UPDATE campaign_map_scenes "
                "SET active = CASE WHEN id = %s THEN 1 ELSE 0 END "
                "WHERE campaign_id = %s",
                (scene_id, campaign_id),
            )
            row = conn.execute(
                "SELECT * FROM campaign_map_scenes WHERE id = %s",
                (scene_id,),
            ).fetchone()
    return normalize_scene(row_dict(row))


def list_scenes(campaign_id: str) -> list[dict[str, Any]]:
    ensure_default_scene(campaign_id)
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM campaign_map_scenes WHERE campaign_id = %s ORDER BY active DESC, updated_at DESC, name",
            (campaign_id,),
        ).fetchall()
    return [normalize_scene(row_dict(row)) for row in rows]


def active_scene(campaign_id: str) -> dict[str, Any]:
    return ensure_default_scene(campaign_id)


def save_scene(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    name = sanitize_text(str(payload.get("name") or "Cena").strip(), 120)
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
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, COALESCE((SELECT active FROM campaign_map_scenes WHERE id = %s), 0))
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
            "SELECT COUNT(*) AS count FROM campaign_map_scenes WHERE campaign_id = %s AND active = 1",
            (campaign_id,),
        ).fetchone()["count"]
        if active_count == 0:
            conn.execute("UPDATE campaign_map_scenes SET active = 1 WHERE id = %s", (scene_id,))
        if payload.get("activate"):
            conn.execute(
                "UPDATE campaign_map_scenes SET active = CASE WHEN id = %s THEN 1 ELSE 0 END WHERE campaign_id = %s",
                (scene_id, campaign_id),
            )
    touch_map_update(campaign_id)
    return active_scene(campaign_id) if payload.get("activate") else get_scene(scene_id)


def get_scene(scene_id: str) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute("SELECT * FROM campaign_map_scenes WHERE id = %s", (scene_id,)).fetchone()
    return normalize_scene(row_dict(row))


def activate_scene(campaign_id: str, scene_id: str) -> dict[str, Any]:
    with db() as conn:
        exists = conn.execute(
            "SELECT 1 FROM campaign_map_scenes WHERE campaign_id = %s AND id = %s",
            (campaign_id, scene_id),
        ).fetchone()
        if not exists:
            return {}
        conn.execute(
            "UPDATE campaign_map_scenes SET active = CASE WHEN id = %s THEN 1 ELSE 0 END WHERE campaign_id = %s",
            (scene_id, campaign_id),
        )
    touch_map_update(campaign_id)
    return active_scene(campaign_id)


def toggle_difficult_terrain(campaign_id: str, grid_x: int, grid_y: int) -> dict[str, Any]:
    """Toggle one grid cell (integer cell coords, not pixels) of difficult
    terrain on the campaign's active scene. Painting is click/drag per-cell
    on the map tool, same spirit as the manual fog rectangles."""
    scene = active_scene(campaign_id)
    with db() as conn:
        row = conn.execute(
            "SELECT difficult_terrain FROM campaign_map_scenes WHERE id = %s",
            (scene["id"],),
        ).fetchone()
        cells = _parse_difficult_terrain(row_dict(row).get("difficult_terrain") if row else None)
        cell = [int(grid_x), int(grid_y)]
        if cell in cells:
            cells = [c for c in cells if c != cell]
        else:
            cells.append(cell)
        conn.execute(
            "UPDATE campaign_map_scenes SET difficult_terrain = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (json.dumps(cells), scene["id"]),
        )
    touch_map_update(campaign_id)
    return get_scene(str(scene["id"]))


def clear_difficult_terrain(campaign_id: str) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        conn.execute(
            "UPDATE campaign_map_scenes SET difficult_terrain = '[]', updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (scene["id"],),
        )
    touch_map_update(campaign_id)
    return get_scene(str(scene["id"]))
