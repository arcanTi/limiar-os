"""HTTP coverage for revision-guarded character writes."""

from http import HTTPStatus

from fastapi.testclient import TestClient

from backend.asgi import create_app


def test_character_write_rejects_a_stale_revision(db_path, make_session):
    token = make_session("mestre", role="gm")["token"]
    headers = {"Authorization": f"Bearer {token}"}
    with TestClient(create_app()) as client:
        created = client.post(
            "/api/characters",
            headers=headers,
            json={"id": "revision-sheet", "name": "Original"},
        )
        assert created.status_code == HTTPStatus.OK
        assert created.json()["revision"] == 0

        saved = client.post(
            "/api/characters",
            headers=headers,
            json={"id": "revision-sheet", "name": "Atualizada", "expectedRevision": 0},
        )
        assert saved.status_code == HTTPStatus.OK
        assert saved.json()["revision"] == 1

        stale = client.post(
            "/api/characters",
            headers=headers,
            json={"id": "revision-sheet", "name": "Antiga", "expectedRevision": 0},
        )

    assert stale.status_code == HTTPStatus.CONFLICT
    assert stale.json()["error"] == {
        "code": "REVISION_CONFLICT",
        "message": "This record was changed by another user. Reload and try again.",
        "details": {
            "resource": "character",
            "id": "revision-sheet",
            "expectedRevision": 0,
            "currentRevision": 1,
        },
    }
