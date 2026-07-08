"""Campaign battle-map persistence and access helpers."""

import json
import secrets
from typing import Any

from ..db import db
from ..util import slug
from .campaigns import list_campaigns_for
from .records import get_record


def row_dict(row) -> dict[str, Any]:
    return dict(row) if row else {}


def is_staff(session: dict[str, str]) -> bool:
    return session.get("role") in ("admin", "gm")


def can_access_campaign(campaign_id: str, session: dict[str, str]) -> bool:
    return any(c.get("id") == campaign_id for c in list_campaigns_for(session))


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
        "active": bool(scene.get("active")),
        "difficultTerrain": _parse_difficult_terrain(scene.get("difficult_terrain")),
    }


def normalize_token(token: dict[str, Any], session: dict[str, str] | None = None) -> dict[str, Any]:
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
        "visible": bool(token.get("visible")),
        "move": float(token["move"]) if token.get("move") is not None else None,
    }
    if session and not is_staff(session) and out["kind"] != "player":
        out["hp"] = None
        out["hpMax"] = None
    return out


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


def map_state(campaign_id: str, session: dict[str, str]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    scene_id = str(scene["id"])
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
    return {
        "scene": scene,
        "scenes": list_scenes(campaign_id),
        "tokens": [normalize_token(row_dict(row), session) for row in tokens],
        "fogAreas": [normalize_fog(row_dict(row)) for row in fog],
        "reveals": [normalize_reveal(row_dict(row)) for row in reveals],
        "canEdit": is_staff(session),
        "username": session["username"],
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
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_map_scenes(
              id, campaign_id, name, background, background_fit, width, height,
              grid_size, fog_enabled, shadow_opacity, active
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT active FROM campaign_map_scenes WHERE id = ?), 0))
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              background = excluded.background,
              background_fit = excluded.background_fit,
              width = excluded.width,
              height = excluded.height,
              grid_size = excluded.grid_size,
              fog_enabled = excluded.fog_enabled,
              shadow_opacity = excluded.shadow_opacity,
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
    with db() as conn:
        conn.execute(
            """
            INSERT INTO campaign_map_tokens(
              id, campaign_id, scene_id, character_id, name, kind, owner_username,
              x, y, size, color, image, hp, hp_max, vision, visible, move
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
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
              visible = excluded.visible,
              move = excluded.move,
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
                1 if payload.get("visible", True) else 0,
                max(0, min(20, float(payload["move"]))) if payload.get("move") not in (None, "") else None,
            ),
        )
        row = conn.execute("SELECT * FROM campaign_map_tokens WHERE id = ?", (token_id,)).fetchone()
    token = normalize_token(row_dict(row))
    add_reveal(campaign_id, str(scene["id"]), token_id, token["x"], token["y"], float(token["vision"] or 0))
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
        vision = float(token.get("vision") or 0)
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
    return True


def delete_token(campaign_id: str, token_id: str) -> bool:
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_map_tokens WHERE campaign_id = ? AND id = ?",
            (campaign_id, token_id),
        )
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
    return get_scene(str(scene["id"]))


def clear_difficult_terrain(campaign_id: str) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    with db() as conn:
        conn.execute(
            "UPDATE campaign_map_scenes SET difficult_terrain = '[]', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (scene["id"],),
        )
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
    return normalize_fog(row_dict(row))


def delete_fog(campaign_id: str, fog_id: str) -> bool:
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_map_fog WHERE campaign_id = ? AND id = ?",
            (campaign_id, fog_id),
        )
    return cur.rowcount > 0


def clear_reveals(campaign_id: str) -> bool:
    scene = active_scene(campaign_id)
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM campaign_map_reveals WHERE campaign_id = ? AND scene_id = ?",
            (campaign_id, scene["id"]),
        )
    return cur.rowcount > 0


def sync_player_tokens(campaign_id: str) -> int:
    scene = active_scene(campaign_id)
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
            count += 1
    return count
