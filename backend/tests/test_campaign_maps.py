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
