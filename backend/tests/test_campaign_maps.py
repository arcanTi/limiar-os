from backend.repositories import campaign_maps as maps
from backend.repositories.records import set_setting, upsert_record


def test_upsert_token_can_link_an_existing_token_to_a_character(db_path):
    """CM1 "vinculo forte": found live while wiring the turn highlight — the
    ON CONFLICT DO UPDATE clause never touched character_id, so re-saving an
    existing token (e.g. linking it to a character after the fact from the
    map's token form) silently dropped the link every time."""
    campaign_id = "camp-1"
    token = maps.upsert_token(campaign_id, {"name": "Mystery NPC", "x": 10, "y": 10})
    assert token["characterId"] is None

    relinked = maps.upsert_token(campaign_id, {"id": token["id"], "name": "Mystery NPC", "characterId": "vesper", "x": 10, "y": 10})
    assert relinked["characterId"] == "vesper"


def test_map_state_combat_block_reflects_active_turn(db_path):
    """CM1: map_state must expose enough for the map to highlight whose turn
    it is without a parallel fetch — active/round/turnCharacterId, no more
    (NPC secrecy is a token-visibility concern, unrelated to this block)."""
    campaign_id = "camp-1"
    set_setting("combat-state", {
        "active": True,
        "round": 3,
        "turnIndex": 1,
        "order": ["mira", "rook"],
        "combatants": {
            "mira": {"side": "pc", "acted": True, "defeated": False},
            "rook": {"side": "pc", "acted": False, "defeated": False},
        },
    })

    combat = maps.map_state(campaign_id, {"username": "player1", "role": "player"})["combat"]
    assert combat == {"active": True, "roundNumber": 3, "turnCharacterId": "rook"}


def test_map_state_combat_block_skips_defeated_current_combatant(db_path):
    campaign_id = "camp-1"
    set_setting("combat-state", {
        "active": True,
        "round": 1,
        "turnIndex": 0,
        "order": ["ganger"],
        "combatants": {"ganger": {"side": "enemy", "acted": False, "defeated": True}},
    })

    combat = maps.map_state(campaign_id, {"username": "gm", "role": "gm"})["combat"]
    assert combat["turnCharacterId"] is None


def test_map_state_combat_block_defaults_when_no_combat_ever_started(db_path):
    combat = maps.map_state("camp-1", {"username": "gm", "role": "gm"})["combat"]
    assert combat == {"active": False, "roundNumber": 0, "turnCharacterId": None}


def test_delete_token_gcs_its_reveals(db_path):
    """README-MAPA B5: a reveal outlives the token that earned it forever —
    nothing can ever see or clear it again, so it just sits there clearing
    fog nobody asked for. delete_token must GC reveals tied to that token."""
    campaign_id = "camp-1"
    scene = maps.active_scene(campaign_id)
    token = maps.upsert_token(campaign_id, {"name": "Scout", "x": 100, "y": 100})
    other_token = maps.upsert_token(campaign_id, {"name": "Guard", "x": 200, "y": 200})

    maps.add_reveal(campaign_id, scene["id"], token["id"], 100, 100, 50)
    maps.add_reveal(campaign_id, scene["id"], other_token["id"], 200, 200, 50)
    maps.add_personal_reveal(campaign_id, scene["id"], "gm", token["id"], 100, 100, 50)

    assert maps.delete_token(campaign_id, token["id"]) is True

    remaining = maps.map_state(campaign_id, {"username": "gm", "role": "gm"})["reveals"]
    assert [r for r in remaining if r["tokenId"] == token["id"]] == []
    assert [r for r in remaining if r["tokenId"] == other_token["id"]]

    personal_remaining = maps.personal_reveals(campaign_id, scene["id"], "gm")
    assert personal_remaining == []


def test_delete_token_returns_false_when_nothing_deleted(db_path):
    assert maps.delete_token("camp-1", "tok-does-not-exist") is False


# Fase MUNICAO-NO-MAPA (G4): token HUD ammo cross-reference — CM0 already
# persists `magazine`/`currentAmmo` on gear once the sheet/cockpit has
# normalized+saved it (see frontend Component.js normalizeGearItem). These
# tests exercise the read side that surfaces that state on the token payload
# the map already fetches, same pattern as hp/criticalInjuries/statusEffects.
def test_map_state_token_exposes_primary_weapon_ammo(db_path):
    campaign_id = "camp-1"
    upsert_record("characters", {
        "id": "mira",
        "name": "Mira",
        "ownerUsername": "mira-player",
        "gear": [
            {"id": "knife", "name": "Knife", "melee": True},
            {"id": "pistol", "name": "Medium Pistol", "magazine": 12, "currentAmmo": 5},
        ],
    })
    token = maps.upsert_token(campaign_id, {"name": "Mira", "kind": "player", "characterId": "mira", "ownerUsername": "mira-player", "x": 1, "y": 1})

    state = maps.map_state(campaign_id, {"username": "mira-player", "role": "player"})
    out = next(t for t in state["tokens"] if t["id"] == token["id"])
    assert out["ammo"] == {"weaponId": "pistol", "weaponName": "Medium Pistol", "currentAmmo": 5, "magazine": 12}


def test_map_state_token_ammo_prefers_equipped_weapon(db_path):
    campaign_id = "camp-1"
    upsert_record("characters", {
        "id": "rook",
        "name": "Rook",
        "ownerUsername": "rook-player",
        "gear": [
            {"id": "spare", "name": "Spare Pistol", "magazine": 8, "currentAmmo": 8, "equipped": False},
            {"id": "smg", "name": "SMG", "magazine": 30, "currentAmmo": 0, "equipped": True},
        ],
    })
    token = maps.upsert_token(campaign_id, {"name": "Rook", "kind": "player", "characterId": "rook", "ownerUsername": "rook-player", "x": 1, "y": 1})

    state = maps.map_state(campaign_id, {"username": "rook-player", "role": "player"})
    out = next(t for t in state["tokens"] if t["id"] == token["id"])
    assert out["ammo"]["weaponId"] == "smg"
    assert out["ammo"]["currentAmmo"] == 0


def test_map_state_token_ammo_none_when_no_ammo_tracked_gear(db_path):
    campaign_id = "camp-1"
    upsert_record("characters", {
        "id": "ghost",
        "name": "Ghost",
        "ownerUsername": "ghost-player",
        "gear": [{"id": "katana", "name": "Katana", "melee": True}],
    })
    token = maps.upsert_token(campaign_id, {"name": "Ghost", "kind": "player", "characterId": "ghost", "ownerUsername": "ghost-player", "x": 1, "y": 1})

    state = maps.map_state(campaign_id, {"username": "ghost-player", "role": "player"})
    out = next(t for t in state["tokens"] if t["id"] == token["id"])
    assert out["ammo"] is None


def test_map_state_token_ammo_suppressed_for_gm_only_visibility(db_path):
    """NPC tokens default to gm-only resourceVisibility — a non-owner,
    non-staff viewer must not learn an enemy's ammo any more than their HP
    (same _resource_visible_to gate as hp/criticalInjuries)."""
    campaign_id = "camp-1"
    upsert_record("characters", {
        "id": "ganger",
        "name": "Ganger",
        "gear": [{"id": "pistol", "name": "Pistol", "magazine": 12, "currentAmmo": 12}],
    })
    token = maps.upsert_token(campaign_id, {"name": "Ganger", "kind": "npc", "characterId": "ganger", "x": 1, "y": 1})

    state = maps.map_state(campaign_id, {"username": "some-player", "role": "player"})
    out = next(t for t in state["tokens"] if t["id"] == token["id"])
    assert out["ammo"] is None

    gm_state = maps.map_state(campaign_id, {"username": "gm", "role": "gm"})
    gm_out = next(t for t in gm_state["tokens"] if t["id"] == token["id"])
    assert gm_out["ammo"]["weaponId"] == "pistol"


# --- Fase AREA: template `untilResolved` lifecycle -------------------------

def test_resolve_template_marks_resolved_and_disappears_for_players(db_path):
    campaign_id = "camp-1"
    gm = {"username": "gm", "role": "gm"}
    tpl = maps.save_template(campaign_id, {"kind": "circle", "x": 10, "y": 10, "distanceUnits": 5, "lifecycle": "untilResolved"}, gm)
    assert tpl["revision"] == 0
    assert tpl["resolved"] is False

    resolved = maps.resolve_template(campaign_id, tpl["id"], tpl["revision"], gm)
    assert resolved["resolved"] is True
    assert resolved["revision"] == 1

    player_view = maps.list_templates(campaign_id, tpl["sceneId"], {"username": "player1", "role": "player"})
    assert player_view == []

    gm_view = maps.list_templates(campaign_id, tpl["sceneId"], gm)
    assert [t["id"] for t in gm_view] == [tpl["id"]]
    assert gm_view[0]["resolved"] is True


def test_resolve_template_rejects_stale_expected_revision(db_path):
    campaign_id = "camp-1"
    gm = {"username": "gm", "role": "gm"}
    tpl = maps.save_template(campaign_id, {"kind": "circle", "x": 0, "y": 0, "distanceUnits": 5, "lifecycle": "untilResolved"}, gm)
    try:
        maps.resolve_template(campaign_id, tpl["id"], tpl["revision"] + 1, gm)
        assert False, "expected TemplateRevisionConflict"
    except maps.TemplateRevisionConflict:
        pass


def test_resolve_template_denies_non_owner_non_staff(db_path):
    campaign_id = "camp-1"
    owner = {"username": "alice", "role": "player"}
    other = {"username": "bob", "role": "player"}
    tpl = maps.save_template(campaign_id, {"kind": "circle", "x": 0, "y": 0, "distanceUnits": 5, "lifecycle": "untilResolved"}, owner)
    assert maps.resolve_template(campaign_id, tpl["id"], tpl["revision"], other) is None


def test_resolve_template_stays_dimmed_for_gm_one_round_then_prunes(db_path):
    campaign_id = "camp-1"
    gm = {"username": "gm", "role": "gm"}
    set_setting("combat-state", {
        "active": True, "round": 1, "turnIndex": 0,
        "order": ["ganger"], "combatants": {"ganger": {"side": "enemy", "acted": False, "defeated": False}},
    })
    tpl = maps.save_template(campaign_id, {"kind": "circle", "x": 0, "y": 0, "distanceUnits": 5, "lifecycle": "untilResolved"}, gm)
    maps.resolve_template(campaign_id, tpl["id"], tpl["revision"], gm)

    # Same round it was resolved in: still visible (dimmed) for the GM.
    assert [t["id"] for t in maps.list_templates(campaign_id, tpl["sceneId"], gm)] == [tpl["id"]]

    # One round later: still visible per the "one extra round" grace window.
    set_setting("combat-state", {
        "active": True, "round": 2, "turnIndex": 0,
        "order": ["ganger"], "combatants": {"ganger": {"side": "enemy", "acted": False, "defeated": False}},
    })
    assert [t["id"] for t in maps.list_templates(campaign_id, tpl["sceneId"], gm)] == [tpl["id"]]

    # Two rounds later: stale, lazily pruned even for the GM.
    set_setting("combat-state", {
        "active": True, "round": 3, "turnIndex": 0,
        "order": ["ganger"], "combatants": {"ganger": {"side": "enemy", "acted": False, "defeated": False}},
    })
    assert maps.list_templates(campaign_id, tpl["sceneId"], gm) == []


def test_delete_template_still_works_on_a_resolved_template(db_path):
    campaign_id = "camp-1"
    gm = {"username": "gm", "role": "gm"}
    tpl = maps.save_template(campaign_id, {"kind": "circle", "x": 0, "y": 0, "distanceUnits": 5, "lifecycle": "untilResolved"}, gm)
    maps.resolve_template(campaign_id, tpl["id"], tpl["revision"], gm)
    assert maps.delete_template(campaign_id, tpl["id"], gm) is True


# --- G2: destructible cover (props) -----------------------------------------

def test_save_prop_persists_and_bumps_scene_revision(db_path):
    campaign_id = "camp-1"
    scene = maps.active_scene(campaign_id)
    prop = maps.save_prop(campaign_id, {"x": 50, "y": 60, "w": 40, "h": 20, "hpMax": 15, "material": "wood", "expectedRevision": scene["revision"]})
    assert prop["hp"] == 15
    assert prop["hpMax"] == 15
    assert prop["destroyed"] is False
    assert prop["sceneRevision"] == scene["revision"] + 1

    listed = maps.list_props(campaign_id, scene["id"])
    assert [p["id"] for p in listed] == [prop["id"]]


def test_save_prop_rejects_stale_scene_revision(db_path):
    campaign_id = "camp-1"
    maps.active_scene(campaign_id)
    try:
        maps.save_prop(campaign_id, {"x": 0, "y": 0, "hpMax": 10, "expectedRevision": 999})
        assert False, "expected SceneRevisionConflict"
    except maps.SceneRevisionConflict:
        pass


def test_damage_prop_reduces_hp_and_marks_destroyed_at_zero(db_path):
    campaign_id = "camp-1"
    scene = maps.active_scene(campaign_id)
    prop = maps.save_prop(campaign_id, {"x": 0, "y": 0, "hpMax": 10, "expectedRevision": scene["revision"]})

    hit = maps.damage_prop(campaign_id, prop["id"], 4, prop["sceneRevision"])
    assert hit["hp"] == 6
    assert hit["destroyed"] is False

    killed = maps.damage_prop(campaign_id, prop["id"], 999, hit["sceneRevision"])
    assert killed["hp"] == 0
    assert killed["destroyed"] is True


def test_delete_prop_removes_it_from_the_scene(db_path):
    campaign_id = "camp-1"
    scene = maps.active_scene(campaign_id)
    prop = maps.save_prop(campaign_id, {"x": 0, "y": 0, "hpMax": 10, "expectedRevision": scene["revision"]})
    result = maps.delete_prop(campaign_id, prop["id"], prop["sceneRevision"])
    assert result["deleted"] is True
    assert maps.list_props(campaign_id, scene["id"]) == []


def test_map_state_includes_props(db_path):
    campaign_id = "camp-1"
    scene = maps.active_scene(campaign_id)
    maps.save_prop(campaign_id, {"x": 0, "y": 0, "hpMax": 10, "expectedRevision": scene["revision"]})
    props = maps.map_state(campaign_id, {"username": "gm", "role": "gm"})["props"]
    assert len(props) == 1
