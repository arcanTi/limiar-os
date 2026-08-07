"""Fog, reveal history, and ephemeral ping persistence."""

import secrets
from typing import Any

from ..db import db
from .campaign_map_common import (
    normalize_fog,
    normalize_ping,
    normalize_reveal,
    row_dict,
    touch_map_update,
)
from .campaign_map_scenes import active_scene

PING_VISIBLE_SECONDS = 10

def add_ping(campaign_id: str, username: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    ping_id = f"ping-{secrets.token_hex(8)}"
    with db() as conn:
        conn.execute(
            "DELETE FROM campaign_map_pings WHERE campaign_id = %s AND created_at < CURRENT_TIMESTAMP - INTERVAL '60 seconds'",
            (campaign_id,),
        )
        conn.execute(
            """
            INSERT INTO campaign_map_pings(id, campaign_id, scene_id, username, x, y, color)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
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
        row = conn.execute("SELECT * FROM campaign_map_pings WHERE id = %s", (ping_id,)).fetchone()
    result = normalize_ping(row_dict(row))
    touch_map_update(campaign_id)
    return result


def recent_pings(campaign_id: str, scene_id: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM campaign_map_pings
            WHERE campaign_id = %s AND scene_id = %s
              AND created_at >= CURRENT_TIMESTAMP - (%s * INTERVAL '1 second')
            ORDER BY created_at
            """,
            (campaign_id, scene_id, PING_VISIBLE_SECONDS),
        ).fetchall()
    return [normalize_ping(row_dict(row)) for row in rows]


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
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (f"rev-{secrets.token_hex(8)}", campaign_id, scene_id, token_id, x, y, radius),
        )


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
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (f"prev-{secrets.token_hex(8)}", campaign_id, scene_id, str(username)[:120], token_id, x, y, radius),
        )


def personal_reveals(campaign_id: str, scene_id: str, username: str) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT * FROM campaign_map_reveals_personal
            WHERE campaign_id = %s AND scene_id = %s AND username = %s
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


def add_fog(campaign_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    fog_id = str(payload.get("id") or f"fog-{secrets.token_hex(8)}")
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_map_fog(id, campaign_id, scene_id, x, y, width, height, label)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
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
        row = conn.execute("SELECT * FROM campaign_map_fog WHERE id = %s", (fog_id,)).fetchone()
    result = normalize_fog(row_dict(row))
    touch_map_update(campaign_id)
    return result


def delete_fog(campaign_id: str, fog_id: str) -> bool:
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_map_fog WHERE campaign_id = %s AND id = %s",
            (campaign_id, fog_id),
        )
    if cur.rowcount:
        touch_map_update(campaign_id)
    return cur.rowcount > 0


def clear_reveals(campaign_id: str) -> bool:
    scene = active_scene(campaign_id)
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_map_reveals WHERE campaign_id = %s AND scene_id = %s",
            (campaign_id, scene["id"]),
        )
        cur_personal = conn.execute(
            "DELETE FROM campaign_map_reveals_personal WHERE campaign_id = %s AND scene_id = %s",
            (campaign_id, scene["id"]),
        )
    changed = cur.rowcount > 0 or cur_personal.rowcount > 0
    if changed:
        touch_map_update(campaign_id)
    return changed
