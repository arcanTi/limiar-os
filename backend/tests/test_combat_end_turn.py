"""Ownership rules for the native combat end-turn use case and endpoint."""

from http import HTTPStatus

import pytest
from fastapi.testclient import TestClient

from backend.asgi import create_app
from backend.db import db
from backend.repositories.records import get_campaign_setting, set_campaign_setting, upsert_record


@pytest.fixture()
def combat_table(db_path, make_session):
    campaign_id = "combat-camp"
    make_session("ana", role="player")
    make_session("bruno", role="player")
    make_session("mestre", role="gm")
    with db() as conn:
        conn.execute(
            "INSERT INTO campaigns(id, name, system, visibility, created_by) "
            "VALUES (%s, %s, %s, %s, %s)",
            (campaign_id, "Combat", "cyberpunk-red", "private", "mestre"),
        )
        conn.execute(
            "INSERT INTO campaign_members(campaign_id, username, character_id) "
            "VALUES (%s, %s, %s), (%s, %s, %s)",
            (campaign_id, "ana", "pc-ana", campaign_id, "bruno", "pc-bruno"),
        )
    upsert_record("characters", {"id": "pc-ana", "name": "Ana", "ownerUsername": "ana"})
    upsert_record("characters", {"id": "pc-bruno", "name": "Bruno", "ownerUsername": "bruno"})
    set_campaign_setting(campaign_id, "combat-state", {
        "active": True,
        "round": 1,
        "turnIndex": 0,
        "order": ["pc-ana", "pc-bruno"],
        "combatants": {
            "pc-ana": {"acted": False, "defeated": False},
            "pc-bruno": {"acted": False, "defeated": False},
        },
    })
    return campaign_id


def end_turn(campaign_id: str, token: str, target_id: str, expected_revision: int = 0):
    with TestClient(create_app()) as client:
        return client.post(
            f"/api/campaigns/{campaign_id}/combat-state/end-turn",
            headers={"Authorization": f"Bearer {token}"},
            json={"targetId": target_id, "expectedRevision": expected_revision},
        )


def test_player_ends_own_turn(combat_table, make_session):
    response = end_turn(combat_table, make_session("ana", role="player")["token"], "pc-ana")
    assert response.status_code == HTTPStatus.OK
    assert get_campaign_setting(combat_table, "combat-state")["turnIndex"] == 1


def test_player_cannot_end_another_players_turn(combat_table, make_session):
    make_session("ana", role="player")
    response = end_turn(combat_table, make_session("bruno", role="player")["token"], "pc-ana")
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "NOT_YOUR_COMBATANT"


def test_ownership_is_checked_before_active_turn(combat_table, make_session):
    response = end_turn(combat_table, make_session("bruno", role="player")["token"], "pc-bruno")
    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "NOT_ACTIVE_TURN"


def test_gm_can_end_any_combatants_turn(combat_table, make_session):
    response = end_turn(combat_table, make_session("mestre", role="gm")["token"], "pc-ana")
    assert response.status_code == HTTPStatus.OK


def test_unknown_character_is_rejected(combat_table, make_session):
    response = end_turn(combat_table, make_session("ana", role="player")["token"], "pc-ghost")
    assert response.status_code == HTTPStatus.FORBIDDEN


def test_end_turn_rejects_a_stale_combat_revision(combat_table, make_session):
    token = make_session("ana", role="player")["token"]
    gm_token = make_session("mestre", role="gm")["token"]
    assert end_turn(combat_table, token, "pc-ana", expected_revision=0).status_code == HTTPStatus.OK
    response = end_turn(combat_table, gm_token, "pc-bruno", expected_revision=0)
    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"] == {
        "code": "REVISION_CONFLICT",
        "message": "This record was changed by another user. Reload and try again.",
        "details": {
            "resource": "campaign-setting",
            "id": f"{combat_table}:combat-state",
            "expectedRevision": 0,
            "currentRevision": 1,
        },
    }
