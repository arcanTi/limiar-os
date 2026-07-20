from http import HTTPStatus

from backend.repositories import campaign_maps, campaigns, records

ADMIN = {"username": "admin", "role": "admin"}
PLAYER = {"username": "player", "role": "player"}
OUTSIDER = {"username": "outsider", "role": "player"}
GM = {"username": "gm1", "role": "gm"}


def campaign_ids(rows):
    return {row["id"] for row in rows}


def test_campaign_creation_and_visibility_rules(db_conn):
    public = campaigns.upsert_campaign({"name": "Public Run", "visibility": "public"}, ADMIN)
    private = campaigns.upsert_campaign({"name": "Private Run", "visibility": "private"}, ADMIN)

    assert public["id"] == "public-run"
    assert private["id"] == "private-run"
    assert campaign_ids(campaigns.list_campaigns_for(ADMIN)) == {"public-run", "private-run"}
    assert campaign_ids(campaigns.list_campaigns_for(OUTSIDER)) == {"public-run"}


def test_campaign_invite_and_membership_make_private_campaign_visible(db_conn):
    private = campaigns.upsert_campaign({"name": "Private Run", "visibility": "private"}, ADMIN)
    invite = campaigns.invite_player(private["id"], PLAYER["username"], ADMIN)

    invited_rows = campaigns.list_campaigns_for(PLAYER)
    invited = next(row for row in invited_rows if row["id"] == private["id"])
    assert invite["status"] == "pending"
    assert invited["canJoin"] is True
    assert invited["myInviteId"] == invite["id"]

    records.upsert_record(
        "characters",
        {"id": "player-op", "name": "Player Op", "ownerUsername": PLAYER["username"]},
    )
    membership = campaigns.join_campaign(private["id"], "player-op", PLAYER)

    joined = next(row for row in campaigns.list_campaigns_for(PLAYER) if row["id"] == private["id"])
    assert membership["character_id"] == "player-op"
    assert joined["isMember"] is True
    assert joined["canJoin"] is False
    assert campaigns.notifications_for(PLAYER)[0]["kind"] == "campaign"


def test_campaign_ownership_gate_and_banner_and_invite_cancel_and_member_removal(db_conn):
    other_gm = {"username": "gm2", "role": "gm"}
    campaign = campaigns.upsert_campaign(
        {"name": "Owned Run", "visibility": "public", "bannerUrl": "/uploads/banner-1.png"}, GM,
    )

    # Ownership: the creating GM and admin manage it; a different GM does not.
    assert campaigns.is_campaign_owner(campaign["id"], GM) is True
    assert campaigns.is_campaign_owner(campaign["id"], ADMIN) is True
    assert campaigns.is_campaign_owner(campaign["id"], other_gm) is False

    # Editing without bannerUrl keeps the existing banner...
    kept = campaigns.upsert_campaign({"id": campaign["id"], "name": "Owned Run"}, GM)
    assert kept["banner_url"] == "/uploads/banner-1.png"
    # ...but an explicit clearBanner wipes it even though bannerUrl is absent.
    cleared = campaigns.upsert_campaign({"id": campaign["id"], "name": "Owned Run", "clearBanner": True}, GM)
    assert cleared["banner_url"] in (None, "")

    invite = campaigns.invite_player(campaign["id"], PLAYER["username"], GM)
    assert invite["status"] == "pending"
    assert campaigns.cancel_invite(campaign["id"], PLAYER["username"]) is True
    assert campaigns.cancel_invite(campaign["id"], PLAYER["username"]) is False
    assert campaigns.list_campaigns_for(GM)[0]["invites"] == []

    records.upsert_record("characters", {"id": "member-op", "name": "Member Op", "ownerUsername": PLAYER["username"]})
    campaigns.join_campaign(campaign["id"], "member-op", PLAYER)
    assert campaigns.remove_member(campaign["id"], PLAYER["username"]) is True
    assert campaigns.remove_member(campaign["id"], PLAYER["username"]) is False
    joined = next(row for row in campaigns.list_campaigns_for(GM) if row["id"] == campaign["id"])
    assert joined["members"] == []


def test_campaign_api_invite_edit_and_delete_routes_are_owner_gated(campaign_handler, make_session):
    owner = make_session("gm-owner", role="gm")
    other = make_session("gm-other", role="gm")

    create = campaign_handler({"name": "API Run", "visibility": "public"}, token=owner["token"])
    create._post_campaigns()
    assert create.status == HTTPStatus.CREATED
    campaign_id = create.payload["id"]

    # A GM who doesn't own this campaign can't invite, edit, or delete on it.
    bad_invite = campaign_handler({"username": "someone"}, token=other["token"])
    bad_invite._post_campaign_invite(campaign_id)
    assert bad_invite.status == HTTPStatus.FORBIDDEN

    bad_edit = campaign_handler({"id": campaign_id, "name": "Hijacked"}, token=other["token"])
    assert bad_edit.route_campaign_post("/api/campaigns") is True
    assert bad_edit.status == HTTPStatus.FORBIDDEN

    good_invite = campaign_handler({"username": "someone"}, token=owner["token"])
    good_invite._post_campaign_invite(campaign_id)
    assert good_invite.status == HTTPStatus.CREATED

    bad_cancel = campaign_handler(token=other["token"])
    assert bad_cancel.route_campaign_delete(f"/api/campaigns/{campaign_id}/invites/someone") is True
    assert bad_cancel.status == HTTPStatus.FORBIDDEN

    good_cancel = campaign_handler(token=owner["token"])
    assert good_cancel.route_campaign_delete(f"/api/campaigns/{campaign_id}/invites/someone") is True
    assert good_cancel.status == HTTPStatus.OK
    assert good_cancel.payload == {"cancelled": True}


def test_campaign_map_crud_and_campaign_association(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Map Run", "visibility": "private"}, ADMIN)
    scene = campaign_maps.save_scene(
        campaign["id"],
        {"id": "scene-1", "name": "Warehouse", "width": 800, "height": 600, "activate": True},
    )

    token = campaign_maps.upsert_token(
        campaign["id"],
        {"id": "tok-1", "name": "Guard", "x": 25, "y": 40},
    )
    fog = campaign_maps.add_fog(
        campaign["id"],
        {"id": "fog-1", "x": 1, "y": 2, "width": 3, "height": 4},
    )
    state = campaign_maps.map_state(campaign["id"], ADMIN)

    assert scene["campaignId"] == campaign["id"]
    assert token["campaignId"] == campaign["id"]
    assert token["sceneId"] == scene["id"]
    assert fog["campaignId"] == campaign["id"]
    assert state["scene"]["id"] == "scene-1"
    assert [row["id"] for row in state["tokens"]] == ["tok-1"]
    assert [row["id"] for row in state["fogAreas"]] == ["fog-1"]

    assert campaign_maps.move_token(campaign["id"], "tok-1", 80, 90, ADMIN) is True
    moved = campaign_maps.map_state(campaign["id"], ADMIN)["tokens"][0]
    assert moved["x"] == 80
    assert moved["y"] == 90

    assert campaign_maps.delete_token(campaign["id"], "tok-1") is True
    assert campaign_maps.delete_fog(campaign["id"], "fog-1") is True
    cleared = campaign_maps.map_state(campaign["id"], ADMIN)
    assert cleared["tokens"] == []
    assert cleared["fogAreas"] == []


def test_campaign_map_f8_documents_token_pose_and_group_move(db_conn):
    campaign = campaigns.upsert_campaign({"name": "F8 Map Run", "visibility": "private"}, ADMIN)
    first = campaign_maps.upsert_token(campaign["id"], {"id": "f8-a", "name": "A", "x": 10, "y": 20, "rotation": 450, "elevation": 3})
    campaign_maps.upsert_token(campaign["id"], {"id": "f8-b", "name": "B", "x": 30, "y": 40})
    assert first["rotation"] == 90
    assert first["elevation"] == 3

    revision = campaign_maps.map_state(campaign["id"], ADMIN)["scene"]["revision"]
    drawing = campaign_maps.save_drawing(campaign["id"], {"points": [{"x": 1, "y": 2}, {"x": 40, "y": 50}], "color": "#fff", "width": 4, "expectedRevision": revision})
    pin = campaign_maps.save_pin(campaign["id"], {"x": 22, "y": 24, "label": "GM secret", "visibility": "gm", "expectedRevision": drawing["sceneRevision"]})
    public_pin = campaign_maps.save_pin(campaign["id"], {"x": 25, "y": 28, "label": "All see", "visibility": "all", "expectedRevision": pin["sceneRevision"]})
    assert campaign_maps.map_state(campaign["id"], ADMIN)["drawings"][0]["id"] == drawing["id"]
    assert [row["id"] for row in campaign_maps.map_state(campaign["id"], PLAYER)["pins"]] == [public_pin["id"]]

    assert campaign_maps.move_tokens(campaign["id"], [{"tokenId": "f8-a", "x": 100, "y": 120}, {"tokenId": "f8-b", "x": 140, "y": 160}], GM)
    moved = {row["id"]: row for row in campaign_maps.map_state(campaign["id"], ADMIN)["tokens"]}
    assert (moved["f8-a"]["x"], moved["f8-b"]["y"]) == (100, 160)
    assert campaign_maps.move_tokens(campaign["id"], [{"tokenId": "f8-a", "x": 1, "y": 1}], PLAYER) is False


def test_campaign_map_token_move_field_persists_for_unlinked_tokens(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Movement Run", "visibility": "private"}, ADMIN)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-move", "activate": True})

    token = campaign_maps.upsert_token(campaign["id"], {"id": "tok-npc", "name": "Ganger", "move": 8})
    assert token["move"] == 8.0

    unset = campaign_maps.upsert_token(campaign["id"], {"id": "tok-marker", "name": "Marker"})
    assert unset["move"] is None


def test_campaign_map_ping_lifecycle(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Ping Run", "visibility": "private"}, ADMIN)
    scene = campaign_maps.save_scene(campaign["id"], {"id": "scene-ping", "activate": True})

    ping = campaign_maps.add_ping(campaign["id"], PLAYER["username"], {"x": 120, "y": 340, "color": "#abcdef"})
    assert ping["sceneId"] == scene["id"]
    assert ping["username"] == PLAYER["username"]
    assert ping["x"] == 120
    assert ping["y"] == 340
    assert ping["color"] == "#abcdef"

    state = campaign_maps.map_state(campaign["id"], ADMIN)
    assert [row["id"] for row in state["pings"]] == [ping["id"]]

    # Pings fora da janela de visibilidade somem do map_state (e sao podados
    # do banco no proximo insert).
    from backend.db import db

    with db() as conn:
        conn.execute(
            "UPDATE campaign_map_pings SET created_at = datetime('now', '-120 seconds') WHERE id = ?",
            (ping["id"],),
        )
    assert campaign_maps.map_state(campaign["id"], ADMIN)["pings"] == []

    campaign_maps.add_ping(campaign["id"], ADMIN["username"], {"x": 1, "y": 1})
    with db() as conn:
        remaining = conn.execute("SELECT id FROM campaign_map_pings").fetchall()
    assert ping["id"] not in {row["id"] for row in remaining}


def test_campaign_map_update_version_wakes_long_poll_fallback_seam(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Realtime Run", "visibility": "private"}, ADMIN)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-realtime", "activate": True})
    before = campaign_maps.map_state(campaign["id"], ADMIN)["mapVersion"]
    campaign_maps.add_ping(campaign["id"], PLAYER["username"], {"x": 1, "y": 2})
    after = campaign_maps.wait_for_map_update(campaign["id"], before, timeout=0.01)
    assert after > before


def test_campaign_map_difficult_terrain_toggle_and_clear(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Terrain Run", "visibility": "private"}, ADMIN)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-terrain", "activate": True})

    scene = campaign_maps.toggle_difficult_terrain(campaign["id"], 2, 3)
    assert scene["difficultTerrain"] == [[2, 3]]

    scene = campaign_maps.toggle_difficult_terrain(campaign["id"], 5, 1)
    assert scene["difficultTerrain"] == [[2, 3], [5, 1]]

    scene = campaign_maps.toggle_difficult_terrain(campaign["id"], 2, 3)
    assert scene["difficultTerrain"] == [[5, 1]]

    scene = campaign_maps.clear_difficult_terrain(campaign["id"])
    assert scene["difficultTerrain"] == []


def test_campaign_map_walls_are_revisioned_documents_and_doors_toggle(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Walls Run", "visibility": "private"}, ADMIN)
    scene = campaign_maps.save_scene(campaign["id"], {"id": "scene-walls", "width": 800, "height": 600, "activate": True})

    wall = campaign_maps.save_wall(campaign["id"], {
        "kind": "door", "x1": 100, "y1": 20, "x2": 100, "y2": 180, "expectedRevision": scene["revision"],
    })
    assert wall["kind"] == "door"
    assert wall["open"] is False
    assert wall["sceneRevision"] == scene["revision"] + 1
    assert campaign_maps.map_state(campaign["id"], ADMIN)["walls"][0]["id"] == wall["id"]

    toggled = campaign_maps.toggle_door(campaign["id"], wall["id"], wall["sceneRevision"])
    assert toggled["open"] is True

    import pytest
    with pytest.raises(campaign_maps.SceneRevisionConflict):
        campaign_maps.delete_wall(campaign["id"], wall["id"], wall["sceneRevision"])

    deleted = campaign_maps.delete_wall(campaign["id"], wall["id"], toggled["sceneRevision"])
    assert deleted["deleted"] is True


def test_campaign_map_lights_persist_with_darkness_and_owner_toggle(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Lights Run", "visibility": "private"}, GM)
    scene = campaign_maps.save_scene(campaign["id"], {"id": "scene-lights", "darkness": 0.7, "activate": True})
    token = campaign_maps.upsert_token(campaign["id"], {"id": "light-token", "name": "Mira", "ownerUsername": PLAYER["username"]})

    light = campaign_maps.save_light(campaign["id"], {
        "kind": "token", "tokenId": token["id"], "x": 1, "y": 2, "brightUnits": 6, "dimUnits": 12,
        "expectedRevision": scene["revision"],
    })
    assert light["brightUnits"] == 6
    state = campaign_maps.map_state(campaign["id"], GM)
    assert state["scene"]["darkness"] == 0.7
    assert state["lights"][0]["id"] == light["id"]

    toggled = campaign_maps.toggle_light(campaign["id"], light["id"], light["sceneRevision"], PLAYER)
    assert toggled and toggled["enabled"] is False
    assert campaign_maps.toggle_light(campaign["id"], light["id"], toggled["sceneRevision"], OUTSIDER) is None


def test_campaign_map_template_lifecycle_and_ownership(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Blast Run", "visibility": "private"}, GM)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-blast", "activate": True})

    tpl = campaign_maps.save_template(
        campaign["id"], {"kind": "circle", "x": 100, "y": 100, "distanceUnits": 10}, PLAYER,
    )
    assert tpl["kind"] == "circle"
    assert tpl["ownerUsername"] == PLAYER["username"]
    assert tpl["distanceUnits"] == 10

    # GM can edit/delete anyone's template; the original owner is preserved.
    edited = campaign_maps.save_template(campaign["id"], {"id": tpl["id"], "kind": "cone", "distanceUnits": 12}, GM)
    assert edited is not None
    assert edited["kind"] == "cone"
    assert edited["ownerUsername"] == PLAYER["username"]

    # Another player can't touch someone else's template.
    assert campaign_maps.save_template(campaign["id"], {"id": tpl["id"], "distanceUnits": 99}, OUTSIDER) is None
    assert campaign_maps.delete_template(campaign["id"], tpl["id"], OUTSIDER) is None

    # The owner can delete their own; a second delete finds nothing left.
    assert campaign_maps.delete_template(campaign["id"], tpl["id"], PLAYER) is True
    assert campaign_maps.delete_template(campaign["id"], tpl["id"], PLAYER) is False


def test_campaign_map_template_validation_clamps_and_defaults(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Clamp Run", "visibility": "private"}, GM)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-clamp", "activate": True})

    tpl = campaign_maps.save_template(
        campaign["id"],
        {"kind": "not-a-shape", "distanceUnits": 9999, "widthUnits": -5, "angleDeg": 0, "directionDeg": 400},
        GM,
    )
    assert tpl["kind"] == "circle"
    assert tpl["distanceUnits"] == 100
    assert tpl["widthUnits"] == 0
    assert tpl["angleDeg"] == 1
    assert tpl["directionDeg"] == 40


def test_campaign_map_template_hidden_gating_in_map_state(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Hidden Tpl Run", "visibility": "private"}, GM)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-hidden-tpl", "activate": True})

    records.upsert_record("characters", {"id": "char-tpl", "name": "Tpl Op", "ownerUsername": PLAYER["username"]})
    campaigns.join_campaign(campaign["id"], "char-tpl", PLAYER)

    visible = campaign_maps.save_template(campaign["id"], {"kind": "circle", "distanceUnits": 5}, GM)
    hidden = campaign_maps.save_template(campaign["id"], {"kind": "circle", "distanceUnits": 5, "hidden": True}, GM)

    player_state = campaign_maps.map_state(campaign["id"], PLAYER)
    assert [t["id"] for t in player_state["templates"]] == [visible["id"]]

    gm_state = campaign_maps.map_state(campaign["id"], GM)
    assert {t["id"] for t in gm_state["templates"]} == {visible["id"], hidden["id"]}


def test_campaign_map_access_requires_accepted_membership(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Guarded Run", "visibility": "public"}, GM)

    # Creator gets in without an explicit join row; a site admin bypasses
    # membership too. Neither `public` visibility nor a bare `gm` role
    # grants access on its own.
    assert campaign_maps.can_access_campaign(campaign["id"], GM) is True
    assert campaign_maps.can_access_campaign(campaign["id"], ADMIN) is True
    assert campaign_maps.can_access_campaign(campaign["id"], OUTSIDER) is False

    records.upsert_record(
        "characters",
        {"id": "outsider-op", "name": "Outsider Op", "ownerUsername": OUTSIDER["username"]},
    )
    campaigns.join_campaign(campaign["id"], "outsider-op", OUTSIDER)
    assert campaign_maps.can_access_campaign(campaign["id"], OUTSIDER) is True


def test_campaign_map_state_hides_gm_secret_tokens_from_non_staff(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Secret Run", "visibility": "private"}, GM)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-secret", "activate": True})
    campaign_maps.upsert_token(campaign["id"], {"id": "tok-secret", "name": "Hidden Ganger", "visible": False})
    campaign_maps.upsert_token(campaign["id"], {"id": "tok-open", "name": "Guard", "visible": True})

    records.upsert_record(
        "characters",
        {"id": "player-op2", "name": "Player Op 2", "ownerUsername": PLAYER["username"]},
    )
    campaigns.join_campaign(campaign["id"], "player-op2", PLAYER)

    # Suppressed entirely from the player payload, not just hidden client-side.
    player_state = campaign_maps.map_state(campaign["id"], PLAYER)
    assert [t["id"] for t in player_state["tokens"]] == ["tok-open"]

    staff_state = campaign_maps.map_state(campaign["id"], GM)
    assert {t["id"] for t in staff_state["tokens"]} == {"tok-secret", "tok-open"}


def test_campaign_map_token_resource_visibility_gates_hp_and_conditions(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Wound Run", "visibility": "private"}, GM)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-wound", "activate": True})

    records.upsert_record(
        "characters",
        {
            "id": "char-hurt",
            "name": "Hurt Op",
            "ownerUsername": PLAYER["username"],
            "health": {"cur": 10, "max": 40},
            "criticalInjuries": [
                {"instanceId": "ci-1", "injury": "brokenArm", "name_pt": "Braco quebrado", "location": "body", "treated": False},
            ],
        },
    )
    campaigns.join_campaign(campaign["id"], "char-hurt", PLAYER)

    player_token = campaign_maps.upsert_token(
        campaign["id"],
        {"id": "tok-player", "kind": "player", "characterId": "char-hurt", "ownerUsername": PLAYER["username"], "hp": 10, "hpMax": 40},
    )
    npc_token = campaign_maps.upsert_token(campaign["id"], {"id": "tok-npc", "name": "Ganger", "hp": 5, "hpMax": 20})

    # Players default to party-visible resources (matches the old kind-based
    # rule); NPCs default to GM-only until the GM opts one in.
    assert player_token["resourceVisibility"] == "party"
    assert npc_token["resourceVisibility"] == "gm"

    player_state = campaign_maps.map_state(campaign["id"], PLAYER)
    by_id = {t["id"]: t for t in player_state["tokens"]}
    assert by_id["tok-player"]["hp"] == 10
    assert [c["instanceId"] for c in by_id["tok-player"]["criticalInjuries"]] == ["ci-1"]
    assert by_id["tok-npc"]["hp"] is None
    assert by_id["tok-npc"]["criticalInjuries"] == []

    campaign_maps.upsert_token(campaign["id"], {**npc_token, "resourceVisibility": "party"})
    player_state2 = campaign_maps.map_state(campaign["id"], PLAYER)
    assert next(t for t in player_state2["tokens"] if t["id"] == "tok-npc")["hp"] == 5

    staff_state = campaign_maps.map_state(campaign["id"], GM)
    assert next(t for t in staff_state["tokens"] if t["id"] == "tok-npc")["hp"] == 5


def test_campaign_map_shared_exploration_mode_is_still_the_default(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Shared Default Run", "visibility": "private"}, GM)
    scene = campaign_maps.save_scene(campaign["id"], {"id": "scene-shared", "activate": True})
    assert scene["explorationMode"] == "shared"

    campaign_maps.upsert_token(
        campaign["id"], {"id": "tok-shared", "kind": "player", "ownerUsername": PLAYER["username"], "vision": 200},
    )
    assert [r["tokenId"] for r in campaign_maps.map_state(campaign["id"], PLAYER)["reveals"]] == ["tok-shared"]


def test_campaign_map_individual_exploration_mode_scopes_reveals_per_player(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Split Run", "visibility": "private"}, GM)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-split", "activate": True, "explorationMode": "individual"})
    assert campaign_maps.get_scene("scene-split")["explorationMode"] == "individual"

    # A later save that doesn't carry explorationMode must not silently reset
    # an `individual` scene back to `shared`.
    campaign_maps.save_scene(campaign["id"], {"id": "scene-split", "name": "Split Run (renamed)"})
    assert campaign_maps.get_scene("scene-split")["explorationMode"] == "individual"

    campaign_maps.upsert_token(
        campaign["id"], {"id": "tok-a", "kind": "player", "ownerUsername": PLAYER["username"], "x": 100, "y": 100, "vision": 200},
    )
    campaign_maps.upsert_token(
        campaign["id"], {"id": "tok-b", "kind": "player", "ownerUsername": OUTSIDER["username"], "x": 900, "y": 900, "vision": 200},
    )

    # Each player only sees their own token's exploration history.
    assert [r["tokenId"] for r in campaign_maps.map_state(campaign["id"], PLAYER)["reveals"]] == ["tok-a"]
    assert [r["tokenId"] for r in campaign_maps.map_state(campaign["id"], OUTSIDER)["reveals"]] == ["tok-b"]

    # The GM invariant ("sees everything") holds regardless of exploration mode.
    gm_reveal_tokens = {r["tokenId"] for r in campaign_maps.map_state(campaign["id"], GM)["reveals"]}
    assert gm_reveal_tokens == {"tok-a", "tok-b"}

    campaign_maps.move_token(campaign["id"], "tok-a", 150, 150, GM)
    assert len(campaign_maps.map_state(campaign["id"], PLAYER)["reveals"]) == 2
    assert len(campaign_maps.map_state(campaign["id"], OUTSIDER)["reveals"]) == 1

    # Resetting exploration clears both the shared and the personal history.
    assert campaign_maps.clear_reveals(campaign["id"]) is True
    assert campaign_maps.map_state(campaign["id"], PLAYER)["reveals"] == []
    assert campaign_maps.map_state(campaign["id"], GM)["reveals"] == []
