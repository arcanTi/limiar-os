"""Shared state belongs to exactly one accepted campaign membership."""

from http import HTTPStatus

from fastapi.testclient import TestClient

from backend.asgi import create_app
from backend.db import db
from backend.repositories import campaign_sync


def _create_campaigns() -> None:
    with db() as conn:
        conn.execute(
            "INSERT INTO campaigns(id, name, system, visibility, created_by) VALUES "
            "('scope-a', 'Scope A', 'cyberpunk-red', 'private', 'gm1'), "
            "('scope-b', 'Scope B', 'cyberpunk-red', 'private', 'gm1')"
        )
        conn.execute(
            "INSERT INTO campaign_members(campaign_id, username, character_id) VALUES "
            "('scope-a', 'alice', 'alice-sheet'), "
            "('scope-b', 'bob', 'bob-sheet')"
        )


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_chat_state_and_events_do_not_cross_campaigns(db_path, make_session):
    gm = make_session("gm1", role="gm")
    alice = make_session("alice", role="player")
    make_session("bob", role="player")
    _create_campaigns()
    before_a = campaign_sync.current_version("scope-a")
    before_b = campaign_sync.current_version("scope-b")

    with TestClient(create_app()) as client:
        assert client.post(
            "/api/campaigns/scope-a/chat",
            headers=_headers(gm["token"]),
            json={"text": "only A"},
        ).status_code == HTTPStatus.CREATED
        assert client.post(
            "/api/campaigns/scope-b/chat",
            headers=_headers(gm["token"]),
            json={"text": "only B"},
        ).status_code == HTTPStatus.CREATED

        chat_a = client.get("/api/campaigns/scope-a/chat", headers=_headers(gm["token"])).json()
        chat_b = client.get("/api/campaigns/scope-b/chat", headers=_headers(gm["token"])).json()
        assert [message["text"] for message in chat_a] == ["only A"]
        assert [message["text"] for message in chat_b] == ["only B"]

        denied = client.get("/api/campaigns/scope-b/chat", headers=_headers(alice["token"]))
        assert denied.status_code == HTTPStatus.FORBIDDEN

        for suffix, payload_a, payload_b, field in (
            (
                "combat-state",
                {"active": True, "round": 1, "expectedRevision": 0},
                {"active": True, "round": 2, "expectedRevision": 0},
                "round",
            ),
            ("tarot-state", {"drawn": "a"}, {"drawn": "b"}, "drawn"),
            ("hq", {"ip": 1, "log": []}, {"ip": 2, "log": []}, "ip"),
            ("nexus-challenge", {"id": "a"}, {"id": "b"}, "id"),
            ("nexus-result", {"score": 1}, {"score": 2}, "score"),
        ):
            assert client.post(
                f"/api/campaigns/scope-a/{suffix}",
                headers=_headers(gm["token"]),
                json=payload_a,
            ).status_code == HTTPStatus.OK
            assert client.post(
                f"/api/campaigns/scope-b/{suffix}",
                headers=_headers(gm["token"]),
                json=payload_b,
            ).status_code == HTTPStatus.OK
            assert client.get(
                f"/api/campaigns/scope-a/{suffix}", headers=_headers(gm["token"])
            ).json()[field] == payload_a[field]
            assert client.get(
                f"/api/campaigns/scope-b/{suffix}", headers=_headers(gm["token"])
            ).json()[field] == payload_b[field]

    event_a = campaign_sync.wait_for_campaign_update("scope-a", before_a, timeout=0.05)
    event_b = campaign_sync.wait_for_campaign_update("scope-b", before_b, timeout=0.05)
    assert "chat" in event_a["topics"]
    assert "chat" in event_b["topics"]
