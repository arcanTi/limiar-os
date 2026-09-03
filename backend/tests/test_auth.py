from http import HTTPStatus

from backend import db as db_module
from backend.security import ACCESS_TOKEN_ALPHABET, ACCESS_TOKEN_LENGTH, _login_timestamps


def session_count():
    with db_module.db() as conn:
        return conn.execute("SELECT COUNT(*) AS count FROM sessions").fetchone()["count"]


def access_token_of(username: str) -> str:
    with db_module.db() as conn:
        return conn.execute(
            "SELECT access_token FROM users WHERE username = %s",
            (username,),
        ).fetchone()["access_token"]


def test_login_with_valid_token_creates_session_and_public_user(auth_handler, make_user):
    user = make_user("alice", role="player")
    _login_timestamps.clear()

    handler = auth_handler({"token": user["accessToken"]})
    handler._post_login()

    assert handler.status == HTTPStatus.OK
    assert handler.payload["token"]
    assert handler.payload["user"] == {"username": "alice", "role": "player"}
    assert session_count() == 1


def test_login_normalizes_case_and_separators(auth_handler, make_user):
    user = make_user("alice", role="player")
    _login_timestamps.clear()

    typed = user["accessToken"].lower()
    handler = auth_handler({"token": f" {typed[:3]}-{typed[3:]} "})
    handler._post_login()

    assert handler.status == HTTPStatus.OK
    assert handler.payload["user"]["username"] == "alice"


def test_login_with_unknown_token_does_not_create_session(auth_handler, make_user):
    make_user("alice", access_token="AAAAAA", role="player")
    _login_timestamps.clear()

    handler = auth_handler({"token": "BBBBBB"})
    handler._post_login()

    assert handler.status == HTTPStatus.UNAUTHORIZED
    assert session_count() == 0


def test_login_rejects_tokens_of_the_wrong_shape(auth_handler, make_user):
    make_user("alice", access_token="AAAAAA", role="player")
    _login_timestamps.clear()

    for candidate in ("", "AAAA", "AAAAAAA", "!!!!!!"):
        handler = auth_handler({"token": candidate})
        handler._post_login()
        assert handler.status == HTTPStatus.BAD_REQUEST, candidate
    assert session_count() == 0


def test_login_is_rate_limited_per_ip(auth_handler, make_user):
    make_user("alice", access_token="AAAAAA", role="player")
    _login_timestamps.clear()

    statuses = []
    for _ in range(12):
        handler = auth_handler({"token": "BBBBBB"})
        handler._post_login()
        statuses.append(handler.status)

    assert statuses[-1] == HTTPStatus.TOO_MANY_REQUESTS
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
        {"username": "newbie", "role": "player", "email": "newbie@example.com"},
        token=player["token"],
    )
    denied._post_users()

    assert denied.status == HTTPStatus.UNAUTHORIZED

    allowed = auth_handler(
        {"username": "newbie", "role": "player", "email": "newbie@example.com"},
        token=admin["token"],
    )
    allowed._post_users()

    assert allowed.status == HTTPStatus.CREATED
    assert allowed.payload["username"] == "newbie"
    assert allowed.payload["email"] == "newbie@example.com"


def test_created_user_receives_a_usable_access_token(auth_handler, make_session):
    admin = make_session("admin", role="admin")

    created = auth_handler({"username": "newbie", "role": "player"}, token=admin["token"])
    created._post_users()

    assert created.status == HTTPStatus.CREATED
    issued = created.payload["accessToken"]
    assert len(issued) == ACCESS_TOKEN_LENGTH
    assert set(issued) <= set(ACCESS_TOKEN_ALPHABET)

    _login_timestamps.clear()
    login = auth_handler({"token": issued})
    login._post_login()
    assert login.status == HTTPStatus.OK
    assert login.payload["user"] == {"username": "newbie", "role": "player"}


def test_issued_access_tokens_are_unique_across_accounts(auth_handler, make_session):
    admin = make_session("admin", role="admin")

    issued = set()
    for index in range(8):
        created = auth_handler(
            {"username": f"player-{index}", "role": "player"},
            token=admin["token"],
        )
        created._post_users()
        assert created.status == HTTPStatus.CREATED
        issued.add(created.payload["accessToken"])

    assert len(issued) == 8


def test_gm_can_create_player_account(auth_handler, make_session):
    gm = make_session("gm-user", role="gm")

    created = auth_handler(
        {"username": "newplayer", "role": "player", "email": "newplayer@example.com"},
        token=gm["token"],
    )
    created._post_users()

    assert created.status == HTTPStatus.CREATED
    assert created.payload["email"] == "newplayer@example.com"
    assert created.payload["accessToken"]


def test_gm_create_player_rejects_a_malformed_email(auth_handler, make_session):
    gm = make_session("gm-user", role="gm")

    invalid = auth_handler(
        {"username": "newplayer", "role": "player", "email": "not-an-email"},
        token=gm["token"],
    )
    invalid._post_users()
    assert invalid.status == HTTPStatus.BAD_REQUEST


def test_gm_cannot_create_or_edit_staff_accounts(auth_handler, make_session, make_user):
    gm = make_session("gm-user", role="gm")
    make_user("other-gm", role="gm")

    create_gm = auth_handler(
        {"username": "sneaky", "role": "gm", "email": "sneaky@example.com"},
        token=gm["token"],
    )
    create_gm._post_users()
    assert create_gm.status == HTTPStatus.UNAUTHORIZED

    edit_other_gm = auth_handler({"username": "other-gm", "role": "player"}, token=gm["token"])
    edit_other_gm._post_users()
    assert edit_other_gm.status == HTTPStatus.UNAUTHORIZED


def test_gm_can_reissue_a_player_token_and_the_old_one_dies(auth_handler, make_session):
    gm = make_session("gm-user", role="gm")
    player = make_session("rook", role="player")
    old_token = player["accessToken"]

    reissue = auth_handler(token=gm["token"])
    reissue._post_regenerate_access_token("rook")

    assert reissue.status == HTTPStatus.OK
    new_token = reissue.payload["accessToken"]
    assert new_token != old_token
    # Rotating a token also closes the sessions it had opened.
    assert session_count() == 1

    _login_timestamps.clear()
    stale = auth_handler({"token": old_token})
    stale._post_login()
    assert stale.status == HTTPStatus.UNAUTHORIZED

    fresh = auth_handler({"token": new_token})
    fresh._post_login()
    assert fresh.status == HTTPStatus.OK


def test_gm_cannot_reissue_a_staff_token(auth_handler, make_session, make_user):
    gm = make_session("gm-user", role="gm")
    make_user("other-gm", role="gm")

    denied = auth_handler(token=gm["token"])
    denied._post_regenerate_access_token("other-gm")

    assert denied.status == HTTPStatus.UNAUTHORIZED


def test_reissue_rejects_an_unknown_account(auth_handler, make_session):
    admin = make_session("admin", role="admin")

    missing = auth_handler(token=admin["token"])
    missing._post_regenerate_access_token("nobody")

    assert missing.status == HTTPStatus.NOT_FOUND


def test_user_listing_exposes_tokens_to_staff_only(auth_handler, make_session, make_user):
    admin = make_session("admin", role="admin")
    make_user("rook", access_token="AAAAAA", role="player")

    listing = auth_handler(token=admin["token"])
    listing._request("GET", "/api/users")

    assert listing.status == HTTPStatus.OK
    tokens = {row["username"]: row["accessToken"] for row in listing.payload}
    assert tokens["rook"] == "AAAAAA"

    player = make_session("player", role="player")
    denied = auth_handler(token=player["token"])
    denied._request("GET", "/api/users")
    assert denied.status == HTTPStatus.UNAUTHORIZED


def test_gm_can_delete_player_but_not_staff(auth_handler, make_session, make_user):
    gm = make_session("gm-user", role="gm")
    make_user("rook", role="player")
    make_user("other-gm", role="gm")

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


def test_missing_and_expired_tokens_are_treated_as_logged_out(auth_handler, make_session):
    missing = auth_handler(token="missing-token")
    assert missing.current_session() is None

    expired = make_session("alice", role="player", expires_at="2000-01-01 00:00:00")
    handler = auth_handler(token=expired["token"])

    assert handler.current_session() is None
    assert session_count() == 0


def test_session_renewal_is_throttled_across_requests(auth_handler, make_session):
    session = make_session("alice", role="player", expires_at="2000-01-01 00:00:00")
    # Replace the expired fixture with a live session that is close enough to
    # expiry to require one renewal.
    with db_module.db() as conn:
        conn.execute(
            "UPDATE sessions SET expires_at = CURRENT_TIMESTAMP + INTERVAL '1 hour' "
            "WHERE token = %s",
            (session["token"],),
        )

    first = auth_handler(token=session["token"])
    assert first.current_session()["username"] == "alice"
    with db_module.db() as conn:
        renewed_once = conn.execute(
            "SELECT expires_at FROM sessions WHERE token = %s",
            (session["token"],),
        ).fetchone()["expires_at"]

    second = auth_handler(token=session["token"])
    assert second.current_session()["username"] == "alice"
    with db_module.db() as conn:
        renewed_twice = conn.execute(
            "SELECT expires_at FROM sessions WHERE token = %s",
            (session["token"],),
        ).fetchone()["expires_at"]

    assert renewed_twice == renewed_once


def test_current_session_is_cached_for_one_http_handler(auth_handler, make_session):
    session = make_session("alice", role="player")
    handler = auth_handler(token=session["token"])

    assert handler.current_session()["role"] == "player"
    with db_module.db() as conn:
        conn.execute("UPDATE sessions SET role = 'gm' WHERE token = %s", (session["token"],))

    # Dispatcher and route guards share the same request principal.
    assert handler.current_session()["role"] == "player"


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


def test_self_service_cannot_set_its_own_access_token(auth_handler, make_session):
    player = make_session("alice", role="player")
    original = access_token_of("alice")

    handler = auth_handler(
        {"accessToken": "ZZZZZZ", "access_token": "ZZZZZZ"},
        token=player["token"],
    )
    handler._post_users_me(player)

    assert handler.status == HTTPStatus.OK
    assert access_token_of("alice") == original


def test_player_can_self_promote_to_gm_and_session_updates_immediately(
    auth_handler,
    make_session,
):
    player = make_session("alice", role="player")

    handler = auth_handler({"role": "gm"}, token=player["token"])
    handler._post_users_me(player)

    assert handler.status == HTTPStatus.OK
    assert handler.payload["role"] == "gm"
    with db_module.db() as conn:
        session_role = conn.execute(
            "SELECT role FROM sessions WHERE token = %s",
            (player["token"],),
        ).fetchone()["role"]
        user_role = conn.execute(
            "SELECT role FROM users WHERE username = %s",
            ("alice",),
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
            "SELECT role FROM users WHERE username = %s",
            ("alice",),
        ).fetchone()["role"]
    assert user_role == "player"


def test_admin_role_cannot_be_changed_via_self_service(auth_handler, make_session):
    admin = make_session("root", role="admin")

    handler = auth_handler({"role": "gm"}, token=admin["token"])
    handler._post_users_me(admin)

    assert handler.status == HTTPStatus.BAD_REQUEST
    with db_module.db() as conn:
        user_role = conn.execute(
            "SELECT role FROM users WHERE username = %s",
            ("root",),
        ).fetchone()["role"]
    assert user_role == "admin"
