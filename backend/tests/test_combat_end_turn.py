"""Ownership rules for the native combat end-turn use case and endpoint."""

from http import HTTPStatus

import pytest
from fastapi.testclient import TestClient

from backend.asgi import create_app
from backend.repositories.records import get_setting, set_setting, upsert_record


@pytest.fixture()
def combat_table(db_path):
    upsert_record("characters", {"id": "pc-ana", "name": "Ana", "ownerUsername": "ana"})
    upsert_record("characters", {"id": "pc-bruno", "name": "Bruno", "ownerUsername": "bruno"})
    set_setting("combat-state", {
        "active": True,
        "round": 1,
        "turnIndex": 0,
        "order": ["pc-ana", "pc-bruno"],
        "combatants": {
            "pc-ana": {"acted": False, "defeated": False},
            "pc-bruno": {"acted": False, "defeated": False},
        },
    })


def end_turn(token: str, target_id: str):
    with TestClient(create_app()) as client:
        return client.post(
            "/api/combat-state/end-turn",
            headers={"Authorization": f"Bearer {token}"},
            json={"targetId": target_id},
        )


def test_player_ends_own_turn(combat_table, make_session):
    response = end_turn(make_session("ana", role="player")["token"], "pc-ana")
    assert response.status_code == HTTPStatus.OK
    assert get_setting("combat-state")["turnIndex"] == 1


def test_player_cannot_end_another_players_turn(combat_table, make_session):
    make_session("ana", role="player")
    response = end_turn(make_session("bruno", role="player")["token"], "pc-ana")
    assert response.status_code == HTTPStatus.FORBIDDEN
    assert response.json()["error"]["code"] == "NOT_YOUR_COMBATANT"


def test_ownership_is_checked_before_active_turn(combat_table, make_session):
    response = end_turn(make_session("bruno", role="player")["token"], "pc-bruno")
    assert response.status_code == HTTPStatus.CONFLICT
    assert response.json()["error"]["code"] == "NOT_ACTIVE_TURN"


def test_gm_can_end_any_combatants_turn(combat_table, make_session):
    response = end_turn(make_session("mestre", role="gm")["token"], "pc-ana")
    assert response.status_code == HTTPStatus.OK


def test_unknown_character_is_rejected(combat_table, make_session):
    response = end_turn(make_session("ana", role="player")["token"], "pc-ghost")
    assert response.status_code == HTTPStatus.FORBIDDEN
