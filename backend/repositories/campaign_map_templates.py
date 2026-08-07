"""Area-template aggregate persistence and lifecycle rules."""

import secrets
from typing import Any

from ..db import db
from ..domain.validation import sanitize_text
from .campaign_map_common import (
    TemplateRevisionConflict,
    is_staff,
    normalize_template,
    row_dict,
    touch_map_update,
)
from .campaign_map_scenes import active_scene
from .records import get_setting

TEMPLATE_KINDS = ("circle", "cone", "rectangle", "ray")
TEMPLATE_LIFECYCLES = ("manual", "untilResolved", "untilTurnEnd")
TEMPLATE_RESOLVED_STALE_SECONDS = 600

def _template_visible_to(row: dict[str, Any], session: dict[str, str] | None) -> bool:
    if not row.get("hidden"):
        return True
    if not session:
        return False
    return is_staff(session) or row.get("owner_username") == session.get("username")


def _prune_resolved_templates(conn: Any, campaign_id: str, scene_id: str, combat: dict[str, Any]) -> None:
    active = 1 if combat.get("active") else 0
    cur = conn.execute(
        """
        DELETE FROM campaign_map_templates
        WHERE campaign_id = %s AND scene_id = %s AND resolved_at IS NOT NULL
          AND (
            (%s = 1 AND resolved_round IS NOT NULL AND %s > resolved_round + 1)
            OR ((%s = 0 OR resolved_round IS NULL)
                AND resolved_at <= CURRENT_TIMESTAMP - (%s * INTERVAL '1 second'))
          )
        """,
        (
            campaign_id,
            scene_id,
            active,
            combat.get("roundNumber") or 0,
            active,
            TEMPLATE_RESOLVED_STALE_SECONDS,
        ),
    )
    if cur.rowcount:
        touch_map_update(campaign_id)


def list_templates(campaign_id: str, scene_id: str, session: dict[str, str] | None = None) -> list[dict[str, Any]]:
    combat = _combat_summary()
    with db() as conn:
        _prune_resolved_templates(conn, campaign_id, scene_id, combat)
        rows = conn.execute(
            "SELECT * FROM campaign_map_templates WHERE campaign_id = %s AND scene_id = %s ORDER BY created_at",
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
            "SELECT owner_username FROM campaign_map_templates WHERE id = %s AND campaign_id = %s",
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
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
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
        row = conn.execute("SELECT * FROM campaign_map_templates WHERE id = %s", (template_id,)).fetchone()
    result = normalize_template(row_dict(row))
    touch_map_update(campaign_id)
    return result


def delete_template(campaign_id: str, template_id: str, session: dict[str, str]) -> bool | None:
    """True: deleted. False: no such template. None: exists but caller isn't
    the owner or staff — the route maps that to 403."""
    with db() as conn:
        row = conn.execute(
            "SELECT owner_username FROM campaign_map_templates WHERE id = %s AND campaign_id = %s",
            (template_id, campaign_id),
        ).fetchone()
        if not row:
            return False
        if not is_staff(session) and row_dict(row).get("owner_username") != session["username"]:
            return None
        cur = conn.execute(
            "DELETE FROM campaign_map_templates WHERE campaign_id = %s AND id = %s",
            (campaign_id, template_id),
        )
    if cur.rowcount:
        touch_map_update(campaign_id)
    return cur.rowcount > 0


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


def resolve_template(campaign_id: str, template_id: str, expected_revision: Any, session: dict[str, str]) -> dict[str, Any] | None:
    """None: not found or caller isn't the owner/staff — route maps that to 403/404."""
    combat = _combat_summary()
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM campaign_map_templates WHERE id = %s AND campaign_id = %s",
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
            SET resolved_at = CURRENT_TIMESTAMP, resolved_round = %s, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (combat["roundNumber"], template_id),
        )
        updated = conn.execute("SELECT * FROM campaign_map_templates WHERE id = %s", (template_id,)).fetchone()
    touch_map_update(campaign_id)
    return normalize_template(row_dict(updated))
