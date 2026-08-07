"""Token aggregate persistence, movement, vision, and player synchronization."""

import secrets
from typing import Any

from ..db import db
from ..domain.validation import sanitize_text
from .campaign_map_common import (
    RESOURCE_VISIBILITIES,
    default_resource_visibility,
    is_staff,
    normalize_token,
    row_dict,
    touch_map_update,
    vision_radius_px,
)
from .campaign_map_exploration import _track_personal_reveal, add_reveal
from .campaign_map_scenes import active_scene, get_scene
from .records import get_record


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
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                sanitize_text(str(payload.get("name") or "Token"), 120),
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
        row = conn.execute("SELECT * FROM campaign_map_tokens WHERE id = %s", (token_id,)).fetchone()
    token = normalize_token(row_dict(row))
    radius = vision_radius_px(row_dict(row), scene)
    add_reveal(campaign_id, str(scene["id"]), token_id, token["x"], token["y"], radius)
    _track_personal_reveal(campaign_id, scene, token, token["x"], token["y"], radius)
    touch_map_update(campaign_id)
    return token


def move_token(campaign_id: str, token_id: str, x: float, y: float, session: dict[str, str]) -> bool:
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM campaign_map_tokens WHERE campaign_id = %s AND id = %s",
            (campaign_id, token_id),
        ).fetchone()
        if not row:
            return False
        token = row_dict(row)
        if not is_staff(session) and token.get("owner_username") != session["username"]:
            return False
        conn.execute(
            "UPDATE campaign_map_tokens SET x = %s, y = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (float(x), float(y), token_id),
        )
        scene = get_scene(str(token.get("scene_id")))
        vision = vision_radius_px(token, scene)
        if vision > 0:
            conn.execute(
                """
                INSERT INTO campaign_map_reveals(id, campaign_id, scene_id, token_id, x, y, radius)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
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
        rows = [row_dict(conn.execute("SELECT * FROM campaign_map_tokens WHERE campaign_id = %s AND id = %s", (campaign_id, token_id)).fetchone()) for token_id, _, _ in updates]
        if any(not row for row in rows) or len({row["scene_id"] for row in rows}) != 1:
            return False
        scene = get_scene(str(rows[0]["scene_id"]))
        for row, (_, x, y) in zip(rows, updates):
            conn.execute("UPDATE campaign_map_tokens SET x = %s, y = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s", (x, y, row["id"]))
            radius = vision_radius_px(row, scene)
            if radius > 0:
                conn.execute("INSERT INTO campaign_map_reveals(id,campaign_id,scene_id,token_id,x,y,radius) VALUES(%s,%s,%s,%s,%s,%s,%s)", (f"rev-{secrets.token_hex(8)}", campaign_id, row["scene_id"], row["id"], x, y, radius))
    for row, (_, x, y) in zip(rows, updates):
        radius = vision_radius_px(row, scene)
        if radius > 0:
            _track_personal_reveal(campaign_id, scene, normalize_token(row), x, y, radius)
    touch_map_update(campaign_id)
    return True


def delete_token(campaign_id: str, token_id: str) -> bool:
    # A reveal is exploration owned by the token that earned it — once the
    # token is gone nothing can ever see or clear it again, so it just sits
    # in the database forever clearing fog nobody requested. Remove it
    # alongside the token rather than leaving it as a silent leak.
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_map_tokens WHERE campaign_id = %s AND id = %s",
            (campaign_id, token_id),
        )
        if cur.rowcount:
            conn.execute(
                "DELETE FROM campaign_map_reveals WHERE campaign_id = %s AND token_id = %s",
                (campaign_id, token_id),
            )
            conn.execute(
                "DELETE FROM campaign_map_reveals_personal WHERE campaign_id = %s AND token_id = %s",
                (campaign_id, token_id),
            )
    if cur.rowcount:
        touch_map_update(campaign_id)
    return cur.rowcount > 0


def sync_player_tokens(campaign_id: str) -> int:
    scene = active_scene(campaign_id)
    personal_writes: list[tuple[str, str, float, float, float]] = []
    with db() as conn:
        rows = conn.execute(
            "SELECT username, character_id FROM campaign_members WHERE campaign_id = %s ORDER BY username",
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
                VALUES (%s, %s, %s, %s, %s, 'player', %s, %s, %s, 1, %s, %s, %s, %s, 260, 1)
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
                "SELECT x, y, vision FROM campaign_map_tokens WHERE id = %s",
                (token_id,),
            ).fetchone()
            if hp_reveal and float(hp_reveal["vision"] or 0) > 0:
                conn.execute(
                    """
                    INSERT INTO campaign_map_reveals(id, campaign_id, scene_id, token_id, x, y, radius)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
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
