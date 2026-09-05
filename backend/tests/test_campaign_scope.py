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
            (
                "effects",
                {"effects": [{"id": "a-fx", "label_pt": "A"}]},
                {"effects": [{"id": "b-fx", "label_pt": "B"}]},
                "effects",
            ),
            (
                "toxins",
                {"toxins": [{"id": "a-tox", "name": "A"}]},
                {"toxins": [{"id": "b-tox", "name": "B"}]},
                "toxins",
            ),
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


def test_toxin_bench_is_staff_write_member_read_and_validated(db_path, make_session):
    """A campaign's homebrew toxins are GM-authored table data, not player input."""
    gm = make_session("gm1", role="gm")
    alice = make_session("alice", role="player")
    make_session("bob", role="player")
    _create_campaigns()

    toxins = [{"id": "neurotox-9", "name": "Neurotox 9", "intensity": "strong", "damage": "4d6"}]
    with TestClient(create_app()) as client:
        assert client.post(
            "/api/campaigns/scope-a/toxins",
            headers=_headers(gm["token"]),
            json={"toxins": toxins},
        ).status_code == HTTPStatus.OK

        # A member reads the bench; the book's toxins never live here, only
        # what this table authored.
        stored = client.get("/api/campaigns/scope-a/toxins", headers=_headers(alice["token"]))
        assert stored.status_code == HTTPStatus.OK
        assert stored.json()["toxins"] == toxins

        # A campaign with no bench answers with an empty list, not a 404.
        assert client.get(
            "/api/campaigns/scope-b/toxins", headers=_headers(gm["token"])
        ).json() == {"toxins": []}

        # Players cannot author toxins, even on their own table.
        assert client.post(
            "/api/campaigns/scope-a/toxins",
            headers=_headers(alice["token"]),
            json={"toxins": []},
        ).status_code == HTTPStatus.UNAUTHORIZED

        # Outsiders cannot read another table's bench.
        assert client.get(
            "/api/campaigns/scope-b/toxins", headers=_headers(alice["token"])
        ).status_code == HTTPStatus.FORBIDDEN

        for bad in ({"toxins": "arsenic"}, {"toxins": ["arsenic"]}, {}):
            assert client.post(
                "/api/campaigns/scope-a/toxins",
                headers=_headers(gm["token"]),
                json=bad,
            ).status_code == HTTPStatus.BAD_REQUEST


def test_effect_bench_is_staff_write_member_read_and_validated(db_path, make_session):
    """GM-authored effects are table data with the same shape rules as toxins."""
    gm = make_session("gm1", role="gm")
    alice = make_session("alice", role="player")
    make_session("bob", role="player")
    _create_campaigns()

    effects = [{
        "id": "sobrecarga-neural",
        "label_pt": "Sobrecarga Neural",
        "duration": {"value": 3, "unit": "round"},
        "modifiers": {"actionBonus": -2, "moveBonus": -1},
    }]
    with TestClient(create_app()) as client:
        assert client.post(
            "/api/campaigns/scope-a/effects",
            headers=_headers(gm["token"]),
            json={"effects": effects},
        ).status_code == HTTPStatus.OK

        stored = client.get("/api/campaigns/scope-a/effects", headers=_headers(alice["token"]))
        assert stored.status_code == HTTPStatus.OK
        assert stored.json()["effects"] == effects

        assert client.get(
            "/api/campaigns/scope-b/effects", headers=_headers(gm["token"])
        ).json() == {"effects": []}

        assert client.post(
            "/api/campaigns/scope-a/effects",
            headers=_headers(alice["token"]),
            json={"effects": []},
        ).status_code == HTTPStatus.UNAUTHORIZED

        assert client.get(
            "/api/campaigns/scope-b/effects", headers=_headers(alice["token"])
        ).status_code == HTTPStatus.FORBIDDEN

        for bad in ({"effects": "sobrecarga"}, {"effects": ["sobrecarga"]}, {}):
            assert client.post(
                "/api/campaigns/scope-a/effects",
                headers=_headers(gm["token"]),
                json=bad,
            ).status_code == HTTPStatus.BAD_REQUEST


def test_campaignless_character_survives_a_gm_edit(db_path, make_session):
    """A campaign-less sheet stays listed after it is saved.

    The application layer carries "no campaign" as the empty string, but the
    column stores it as NULL and the campaign-less list selects on IS NULL.
    Writing "" through would strand the row: the sheet kept existing and could
    still be fetched by id, while disappearing from the desktop that owns it.
    """
    gm = make_session("gm1", role="gm")

    with TestClient(create_app()) as client:
        created = client.post(
            "/api/characters",
            headers=_headers(gm["token"]),
            json={"name": "Byte", "id": "byte", "level": 4},
        )
        assert created.status_code == HTTPStatus.OK
        assert [row["id"] for row in client.get(
            "/api/characters", headers=_headers(gm["token"])
        ).json()] == ["byte"]

        saved = client.post(
            "/api/characters",
            headers=_headers(gm["token"]),
            json={"name": "Byte", "id": "byte", "level": 4, "ip": 40, "expectedRevision": 0},
        )
        assert saved.status_code == HTTPStatus.OK

        listed = client.get("/api/characters", headers=_headers(gm["token"])).json()
        assert [row["id"] for row in listed] == ["byte"]
        assert listed[0]["ip"] == 40

    with db() as conn:
        stored = conn.execute("SELECT campaignid FROM characters WHERE id = 'byte'").fetchone()
    assert stored["campaignid"] is None


def test_campaignless_list_still_finds_rows_stored_with_an_empty_scope(db_path, make_session):
    """Rows written before the normalization are still campaign-less rows."""
    gm = make_session("gm1", role="gm")
    with db() as conn:
        conn.execute(
            "INSERT INTO characters(id, name, level, campaignid, extra) "
            "VALUES ('legacy', 'Legacy', 3, '', '{}'::jsonb)"
        )

    with TestClient(create_app()) as client:
        listed = client.get("/api/characters", headers=_headers(gm["token"])).json()

    assert [row["id"] for row in listed] == ["legacy"]
