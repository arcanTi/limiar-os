from backend.repositories import campaign_maps, campaigns, records

ADMIN = {"username": "admin", "role": "admin"}
PLAYER = {"username": "player", "role": "player"}
OUTSIDER = {"username": "outsider", "role": "player"}


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


def test_campaign_map_token_move_field_persists_for_unlinked_tokens(db_conn):
    campaign = campaigns.upsert_campaign({"name": "Movement Run", "visibility": "private"}, ADMIN)
    campaign_maps.save_scene(campaign["id"], {"id": "scene-move", "activate": True})

    token = campaign_maps.upsert_token(campaign["id"], {"id": "tok-npc", "name": "Ganger", "move": 8})
    assert token["move"] == 8.0

    unset = campaign_maps.upsert_token(campaign["id"], {"id": "tok-marker", "name": "Marker"})
    assert unset["move"] is None


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
