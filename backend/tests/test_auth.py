from http import HTTPStatus

from backend import db as db_module
from backend.api import auth as auth_module
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
        {"username": "newbie", "password": "password-123", "role": "player", "email": "newbie@example.com"},
        token=player["token"],
    )
    denied._post_users()

    assert denied.status == HTTPStatus.UNAUTHORIZED

    allowed = auth_handler(
        {"username": "newbie", "password": "password-123", "role": "player", "email": "newbie@example.com"},
        token=admin["token"],
    )
    allowed._post_users()

    assert allowed.status == HTTPStatus.CREATED
    assert allowed.payload["username"] == "newbie"
    assert allowed.payload["email"] == "newbie@example.com"
    assert "password_hash" not in allowed.payload


def test_gm_can_create_player_account_with_email(auth_handler, make_session):
    gm = make_session("gm-user", role="gm")

    created = auth_handler(
        {"username": "newplayer", "password": "password-123", "role": "player", "email": "newplayer@example.com"},
        token=gm["token"],
    )
    created._post_users()

    assert created.status == HTTPStatus.CREATED
    assert created.payload["email"] == "newplayer@example.com"


def test_gm_create_player_requires_valid_email(auth_handler, make_session):
    gm = make_session("gm-user", role="gm")

    missing = auth_handler(
        {"username": "newplayer", "password": "password-123", "role": "player"},
        token=gm["token"],
    )
    missing._post_users()
    assert missing.status == HTTPStatus.BAD_REQUEST

    invalid = auth_handler(
        {"username": "newplayer", "password": "password-123", "role": "player", "email": "not-an-email"},
        token=gm["token"],
    )
    invalid._post_users()
    assert invalid.status == HTTPStatus.BAD_REQUEST


def test_gm_cannot_create_or_edit_staff_accounts(auth_handler, make_session, make_user):
    gm = make_session("gm-user", role="gm")
    make_user("other-gm", "password-123", "gm")

    create_gm = auth_handler(
        {"username": "sneaky", "password": "password-123", "role": "gm", "email": "sneaky@example.com"},
        token=gm["token"],
    )
    create_gm._post_users()
    assert create_gm.status == HTTPStatus.UNAUTHORIZED

    edit_other_gm = auth_handler(
        {"username": "other-gm", "password": "password-123", "role": "player"},
        token=gm["token"],
    )
    edit_other_gm._post_users()
    assert edit_other_gm.status == HTTPStatus.UNAUTHORIZED


def test_gm_can_reset_existing_player_password_without_email(auth_handler, make_session):
    gm = make_session("gm-user", role="gm")
    make_session("rook", role="player", password="old-password-1")

    reset = auth_handler(
        {"username": "rook", "password": "new-password-1", "role": "player"},
        token=gm["token"],
    )
    reset._post_users()

    assert reset.status == HTTPStatus.OK

    relogin = auth_handler({"username": "rook", "password": "new-password-1"})
    relogin._post_login()
    assert relogin.status == HTTPStatus.OK


def test_gm_can_delete_player_but_not_staff(auth_handler, make_session, make_user):
    gm = make_session("gm-user", role="gm")
    make_user("rook", "password-123", "player")
    make_user("other-gm", "password-123", "gm")

    delete_player = auth_handler(token=gm["token"])
    delete_player._delete_user("rook")
    assert delete_player.status == HTTPStatus.OK

    delete_gm = auth_handler(token=gm["token"])
    delete_gm._delete_user("other-gm")
    assert delete_gm.status == HTTPStatus.UNAUTHORIZED


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


def test_google_login_returns_503_when_not_configured(auth_handler, monkeypatch):
    monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "")
    _login_timestamps.clear()

    handler = auth_handler({"idToken": "whatever"})
    handler._post_google_login()

    assert handler.status == HTTPStatus.SERVICE_UNAVAILABLE
    assert session_count() == 0


def test_google_login_rejects_invalid_token(auth_handler, monkeypatch):
    monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(auth_module, "_verify_google_id_token", lambda _token: None)
    _login_timestamps.clear()

    handler = auth_handler({"idToken": "bad-token"})
    handler._post_google_login()

    assert handler.status == HTTPStatus.UNAUTHORIZED
    assert session_count() == 0


def test_google_login_creates_new_user_and_session(auth_handler, monkeypatch):
    monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(
        auth_module,
        "_verify_google_id_token",
        lambda _token: {"sub": "google-sub-1", "email": "newplayer@example.com"},
    )
    _login_timestamps.clear()

    handler = auth_handler({"idToken": "good-token"})
    handler._post_google_login()

    assert handler.status == HTTPStatus.OK
    assert handler.payload["token"]
    assert handler.payload["user"] == {"username": "newplayer@example.com", "role": "player"}
    assert session_count() == 1

    with db_module.db() as conn:
        row = conn.execute(
            "SELECT google_sub, email, role FROM users WHERE username = ?",
            ("newplayer@example.com",),
        ).fetchone()
    assert row["google_sub"] == "google-sub-1"
    assert row["email"] == "newplayer@example.com"
    assert row["role"] == "player"


def test_google_login_second_time_reuses_existing_account(auth_handler, monkeypatch):
    monkeypatch.setattr(auth_module, "GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setattr(
        auth_module,
        "_verify_google_id_token",
        lambda _token: {"sub": "google-sub-2", "email": "returning@example.com"},
    )
    _login_timestamps.clear()

    first = auth_handler({"idToken": "good-token"})
    first._post_google_login()
    second = auth_handler({"idToken": "good-token"})
    second._post_google_login()

    assert first.status == HTTPStatus.OK
    assert second.status == HTTPStatus.OK
    assert first.payload["user"]["username"] == second.payload["user"]["username"]

    with db_module.db() as conn:
        count = conn.execute(
            "SELECT COUNT(*) FROM users WHERE email = ?",
            ("returning@example.com",),
        ).fetchone()[0]
    assert count == 1
    assert session_count() == 2


def test_password_login_still_works_after_google_migration(auth_handler, make_user):
    make_user("alice", "correct-password", "player")
    _login_timestamps.clear()

    handler = auth_handler({"username": "alice", "password": "correct-password"})
    handler._post_login()

    assert handler.status == HTTPStatus.OK
    assert handler.payload["user"] == {"username": "alice", "role": "player"}


def test_missing_and_expired_tokens_are_treated_as_logged_out(auth_handler, make_session):
    missing = auth_handler(token="missing-token")
    assert missing.current_session() is None

    expired = make_session("alice", role="player", expires_at="2000-01-01 00:00:00")
    handler = auth_handler(token=expired["token"])

    assert handler.current_session() is None
    assert session_count() == 0


def test_self_service_profile_update_changes_email(auth_handler, make_session):
    player = make_session("alice", role="player")

    handler = auth_handler({"email": "alice@example.com"}, token=player["token"])
    handler._post_users_me(player)

    assert handler.status == HTTPStatus.OK
    assert handler.payload["email"] == "alice@example.com"


def test_self_service_avatar_update_persists_and_shows_in_session(auth_handler, make_session):
    player = make_session("alice", role="player")

    handler = auth_handler({"avatarUrl": "/uploads/avatar-alice.png"}, token=player["token"])
    handler._post_users_me(player)

    assert handler.status == HTTPStatus.OK
    assert handler.payload["avatarUrl"] == "/uploads/avatar-alice.png"

    # Persisted at the users table, not just echoed back — a fresh session
    # lookup (e.g. GET /api/session on reload) must see it too.
    session_handler = auth_handler(token=player["token"])
    session = session_handler.current_session()
    assert session["avatarUrl"] == "/uploads/avatar-alice.png"


def test_self_service_password_change_requires_correct_current_password(auth_handler, make_session):
    player = make_session("alice", role="player", password="old-password-1")

    wrong = auth_handler(
        {"currentPassword": "not-it", "newPassword": "new-password-1"}, token=player["token"],
    )
    wrong._post_users_me(player)
    assert wrong.status == HTTPStatus.UNAUTHORIZED

    right = auth_handler(
        {"currentPassword": "old-password-1", "newPassword": "new-password-1"}, token=player["token"],
    )
    right._post_users_me(player)
    assert right.status == HTTPStatus.OK

    relogin = auth_handler({"username": "alice", "password": "new-password-1"})
    _login_timestamps.clear()
    relogin._post_login()
    assert relogin.status == HTTPStatus.OK


def test_player_can_self_promote_to_gm_and_session_updates_immediately(auth_handler, make_session):
    player = make_session("alice", role="player")

    handler = auth_handler({"role": "gm"}, token=player["token"])
    handler._post_users_me(player)

    assert handler.status == HTTPStatus.OK
    assert handler.payload["role"] == "gm"
    with db_module.db() as conn:
        session_role = conn.execute(
            "SELECT role FROM sessions WHERE token = ?", (player["token"],),
        ).fetchone()["role"]
        user_role = conn.execute(
            "SELECT role FROM users WHERE username = ?", ("alice",),
        ).fetchone()["role"]
    assert session_role == "gm"
    assert user_role == "gm"


def test_self_service_role_change_rejects_admin_target(auth_handler, make_session):
    player = make_session("alice", role="player")

    handler = auth_handler({"role": "admin"}, token=player["token"])
    handler._post_users_me(player)

    assert handler.status == HTTPStatus.BAD_REQUEST
    with db_module.db() as conn:
        user_role = conn.execute(
            "SELECT role FROM users WHERE username = ?", ("alice",),
        ).fetchone()["role"]
    assert user_role == "player"


def test_admin_role_cannot_be_changed_via_self_service(auth_handler, make_session):
    admin = make_session("root", role="admin")

    handler = auth_handler({"role": "gm"}, token=admin["token"])
    handler._post_users_me(admin)

    assert handler.status == HTTPStatus.BAD_REQUEST
    with db_module.db() as conn:
        user_role = conn.execute(
            "SELECT role FROM users WHERE username = ?", ("root",),
        ).fetchone()["role"]
    assert user_role == "admin"
