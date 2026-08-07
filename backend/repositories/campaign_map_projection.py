"""Read model composing the campaign-map aggregates for clients."""

from typing import Any

from ..db import db
from .campaign_map_common import (
    is_staff,
    map_update_version,
    normalize_fog,
    normalize_reveal,
    normalize_token,
    row_dict,
)
from .campaign_map_elements import list_drawings, list_lights, list_pins, list_props, list_walls
from .campaign_map_exploration import personal_reveals, recent_pings
from .campaign_map_scenes import active_scene, list_scenes
from .campaign_map_templates import _combat_summary, list_templates
from .records import get_record


def map_state(campaign_id: str, session: dict[str, str]) -> dict[str, Any]:
    scene = active_scene(campaign_id)
    scene_id = str(scene["id"])
    staff = is_staff(session)
    with db() as conn:
        tokens = conn.execute(
            "SELECT * FROM campaign_map_tokens WHERE campaign_id = %s AND scene_id = %s ORDER BY kind, name",
            (campaign_id, scene_id),
        ).fetchall()
        fog = conn.execute(
            "SELECT * FROM campaign_map_fog WHERE campaign_id = %s AND scene_id = %s ORDER BY created_at",
            (campaign_id, scene_id),
        ).fetchall()
        reveals = conn.execute(
            "SELECT * FROM campaign_map_reveals WHERE campaign_id = %s AND scene_id = %s ORDER BY created_at",
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
    # `individual` exploration mode gives each non-staff viewer their own
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
