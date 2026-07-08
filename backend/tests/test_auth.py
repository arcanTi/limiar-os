from http import HTTPStatus

from backend import db as db_module
from backend.api.auth import _login_timestamps


def session_count():
    with db_module.db() as conn:
        return conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]


def test_login_with_valid_credentials_creates_session_and_public_user(auth_handler, make_user):
    make_user("alice", "correct-password", "player")
    _login_timestamps.clear()

    handler = auth_handler({"username": "alice", "password": "correct-password"})
    handler._post_login()

    assert handler.status == HTTPStatus.OK
    assert handler.payload["token"]
    assert handler.payload["user"] == {"username": "alice", "role": "player"}
    assert "password_hash" not in handler.payload
    assert "password_hash" not in handler.payload["user"]
    assert session_count() == 1


def test_login_with_invalid_credentials_does_not_create_session(auth_handler, make_user):
    make_user("alice", "correct-password", "player")
    _login_timestamps.clear()

    handler = auth_handler({"username": "alice", "password": "wrong-password"})
    handler._post_login()

    assert handler.status == HTTPStatus.UNAUTHORIZED
    assert session_count() == 0


def test_register_creates_player_session(auth_handler):
    _login_timestamps.clear()

    handler = auth_handler({"username": "newbie", "password": "password-123", "role": "admin"})
    handler._post_register()

    assert handler.status == HTTPStatus.CREATED
    assert handler.payload["token"]
    assert handler.payload["user"] == {"username": "newbie", "role": "player"}
    assert session_count() == 1


def test_register_rejects_duplicate_username(auth_handler, make_user):
    make_user("newbie", "password-123", "player")
    _login_timestamps.clear()

    handler = auth_handler({"username": "newbie", "password": "password-456"})
    handler._post_register()

    assert handler.status == HTTPStatus.CONFLICT
    assert session_count() == 0


def test_logout_invalidates_current_session(auth_handler, make_session):
    session = make_session("alice", role="player")

    handler = auth_handler(token=session["token"])
    handler._post_logout()

    assert handler.status == HTTPStatus.OK
    assert handler.payload == {"ok": True}
    assert session_count() == 0


def test_admin_can_create_users_but_player_cannot(auth_handler, make_session):
    admin = make_session("admin", role="admin")
    player = make_session("player", role="player")

    denied = auth_handler(
        {"username": "newbie", "password": "password-123", "role": "player"},
        token=player["token"],
    )
    denied._post_users()

    assert denied.status == HTTPStatus.UNAUTHORIZED

    allowed = auth_handler(
        {"username": "newbie", "password": "password-123", "role": "player"},
        token=admin["token"],
    )
    allowed._post_users()

    assert allowed.status == HTTPStatus.CREATED
    assert allowed.payload["username"] == "newbie"
    assert "password_hash" not in allowed.payload


def test_admin_delete_user_is_restricted_and_cannot_delete_self(auth_handler, make_session):
    admin = make_session("admin", role="admin")
    player = make_session("player", role="player")

    denied = auth_handler(token=player["token"])
    denied._delete_user("admin")

    assert denied.status == HTTPStatus.UNAUTHORIZED

    self_delete = auth_handler(token=admin["token"])
    self_delete._delete_user("admin")

    assert self_delete.status == HTTPStatus.BAD_REQUEST
    assert self_delete.payload["error"]["message"] == "Admin cannot delete itself"

    allowed = auth_handler(token=admin["token"])
    allowed._delete_user("player")

    assert allowed.status == HTTPStatus.OK
    assert allowed.payload == {"deleted": True}


def test_missing_and_expired_tokens_are_treated_as_logged_out(auth_handler, make_session):
    missing = auth_handler(token="missing-token")
    assert missing.current_session() is None

    expired = make_session("alice", role="player", expires_at="2000-01-01 00:00:00")
    handler = auth_handler(token=expired["token"])

    assert handler.current_session() is None
    assert session_count() == 0
