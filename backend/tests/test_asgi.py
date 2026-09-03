import pytest
from fastapi.testclient import TestClient

from backend import db as db_module
from backend.asgi import create_app
from backend.repositories import campaign_sync
from backend.security import ACCESS_TOKEN_ALPHABET, ACCESS_TOKEN_LENGTH


def test_production_lifespan_requires_postgres(monkeypatch):
    monkeypatch.delenv("LIMIAR_DATABASE_URL", raising=False)
    monkeypatch.setattr(db_module, "DATABASE_URL", "")

    with (
        pytest.raises(RuntimeError, match="does not import or fall back to SQLite"),
        TestClient(create_app()),
    ):
        pass


def test_bootstrap_master_gets_a_random_token_when_none_is_configured(db_path, monkeypatch):
    """No configured token must never mean a guessable one."""
    monkeypatch.setattr(db_module, "DEFAULT_MASTER_TOKEN", "")
    db_module.init_db()

    with db_module.db() as conn:
        token = conn.execute(
            "SELECT access_token FROM users WHERE role = 'admin'",
        ).fetchone()["access_token"]

    assert len(token) == ACCESS_TOKEN_LENGTH
    assert set(token) <= set(ACCESS_TOKEN_ALPHABET)


def test_session_route_is_native_fastapi(db_path, make_session):
    session = make_session("asgi-player")

    with TestClient(create_app()) as client:
        response = client.get(
            "/api/session",
            headers={"Authorization": f"Bearer {session['token']}"},
        )

    assert response.status_code == 200
    assert response.json()["authenticated"] is True
    assert response.json()["user"]["username"] == "asgi-player"


def test_auth_and_campaign_routes_are_native_fastapi(db_path, make_session):
    gm = make_session("native-gm", role="gm")

    with TestClient(create_app()) as client:
        login = client.post("/api/login", json={"token": gm["accessToken"]})
        token = login.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        created = client.post(
            "/api/campaigns",
            headers=headers,
            json={"id": "native-campaign", "name": "Native Campaign"},
        )
        listed = client.get("/api/campaigns", headers=headers)

    assert login.status_code == 200
    assert created.status_code == 201
    assert created.json()["id"] == "native-campaign"
    assert [campaign["id"] for campaign in listed.json()] == ["native-campaign"]


def test_campaign_map_routes_are_native_fastapi(db_path, make_session):
    gm = make_session("native-map-gm", role="gm")
    with db_module.db() as conn:
        conn.execute(
            "INSERT INTO campaigns(id, name, created_by) VALUES (%s, %s, %s)",
            ("native-map", "Native Map", gm["username"]),
        )
    headers = {"Authorization": f"Bearer {gm['token']}"}

    with TestClient(create_app()) as client:
        initial = client.get("/api/campaign-maps/native-map", headers=headers)
        created = client.post(
            "/api/campaign-maps/native-map/token",
            headers=headers,
            json={"name": "Guard", "x": 64, "y": 96},
        )
        updated = client.get("/api/campaign-maps/native-map", headers=headers)

    assert initial.status_code == 200
    assert initial.json()["scene"]["id"] == "native-map-default"
    assert created.status_code == 201
    assert created.json()["name"] == "Guard"
    assert [token["name"] for token in updated.json()["tokens"]] == ["Guard"]


def test_campaign_websocket_uses_shared_session_and_event_channel(db_path, make_session):
    session = make_session("socket-player")
    campaign_id = "socket-campaign"
    with db_module.db() as conn:
        conn.execute(
            "INSERT INTO campaigns(id, name, created_by) VALUES (%s, %s, %s)",
            (campaign_id, "Socket Campaign", "socket-player"),
        )
        conn.execute(
            "INSERT INTO campaign_members(campaign_id, username, character_id) VALUES (%s, %s, %s)",
            (campaign_id, "socket-player", "socket-sheet"),
        )

    with (
        TestClient(create_app()) as client,
        client.websocket_connect(
            f"/api/ws/campaigns/{campaign_id}?since=0",
            subprotocols=["limiar.v1", "bearer." + session["token"]],
        ) as websocket,
    ):
        initial = websocket.receive_json()
        assert initial["type"] == "campaign.update"

        campaign_sync.bump_campaign(campaign_id, "map")
        update = websocket.receive_json()

    assert update["changed"] is True
    assert update["topics"] == ["map"]
    assert update["version"] > initial["version"]


def test_database_layer_has_no_sqlite_translation_facade():
    assert not hasattr(db_module, "_translate_postgres_sql")
    assert not hasattr(db_module, "CompatRow")
    assert not hasattr(db_module, "PostgresConnection")
