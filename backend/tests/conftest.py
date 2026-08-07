import os
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient

from backend import db as db_module
from backend.asgi import create_app
from backend.security import password_hash

# Accounts referenced by literal session fixtures. They must exist in `users`
# because campaign membership, invitations, and password resets all reference
# users(username), both in production and in the PostgreSQL test database.
SESSION_USERNAMES = (
    "admin",
    "alice",
    "bob",
    "ghost-player",
    "gm",
    "gm1",
    "gm2",
    "mira-player",
    "newbie",
    "newplayer",
    "other-gm",
    "outsider",
    "player",
    "player1",
    "rook",
    "rook-player",
    "sneaky",
    "some-player",
    "someone",
)

# Campaigns referenced directly by map and synchronization tests. Production
# routes verify campaign existence before reaching these repositories, while
# these tests call repository functions directly.
FIXTURE_CAMPAIGNS = (
    "camp-1",
    "scene-split",
    "sync-camp-bump-1",
    "sync-camp-multi",
    "sync-camp-stale",
)


@pytest.fixture()
def db_path(monkeypatch):
    test_url = os.environ.get("LIMIAR_TEST_DATABASE_URL", "").strip()
    if not test_url:
        pytest.fail("LIMIAR_TEST_DATABASE_URL is required; run the PostgreSQL test service")
    normalized_url = test_url.replace("postgresql+psycopg://", "postgresql://", 1)
    database_name = urlparse(normalized_url).path.lstrip("/")
    if not database_name.endswith("_test"):
        pytest.fail("LIMIAR_TEST_DATABASE_URL must name a database ending in '_test'")
    monkeypatch.setenv("LIMIAR_DATABASE_URL", test_url)
    monkeypatch.setenv("LIMIAR_GM_PASSWORD", "test-only-admin-password")
    db_module.dispose_engine()
    monkeypatch.setattr(db_module, "load_seed_file", lambda: dict(db_module.EMPTY_SEED))
    db_module.init_db()
    with db_module.db() as conn:
        rows = conn.execute(
            "SELECT tablename FROM pg_tables "
            "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
        ).fetchall()
        tables = ", ".join(f'"{row["tablename"]}"' for row in rows)
        if tables:
            conn.execute(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE")
    yield test_url
    db_module.dispose_engine()


@pytest.hookimpl(trylast=True)
def pytest_sessionfinish(session, exitstatus):
    """Make the CI PostgreSQL run fail if any test is skipped."""
    if os.environ.get("LIMIAR_FAIL_ON_SKIP") != "1":
        return
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    skipped = reporter.stats.get("skipped", []) if reporter else []
    if skipped:
        if reporter:
            reporter.write_sep("=", f"zero skips required; found {len(skipped)}")
        session.exitstatus = pytest.ExitCode.TESTS_FAILED


def seed_session_users(usernames=SESSION_USERNAMES) -> None:
    """Create accounts referenced by literal test sessions."""
    with db_module.db() as conn, conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO users(username, password_hash, role) "
            "VALUES (%s, '', 'player') ON CONFLICT DO NOTHING",
            [(name,) for name in usernames],
        )


def seed_fixture_campaigns(campaign_ids=FIXTURE_CAMPAIGNS) -> None:
    """Create campaigns referenced directly by map and sync tests."""
    with db_module.db() as conn, conn.cursor() as cursor:
        cursor.executemany(
            "INSERT INTO campaigns(id, name, system, visibility, created_by)"
            " VALUES (%s, %s, 'cyberpunk-red', 'private', 'gm1') "
            "ON CONFLICT DO NOTHING",
            [(cid, cid) for cid in campaign_ids],
        )


@pytest.fixture()
def db_conn(db_path):
    with db_module.db() as conn:
        yield conn


@pytest.fixture()
def make_user(db_path):
    def _make_user(username, password="password-123", role="player"):
        with db_module.db() as conn:
            conn.execute(
                "INSERT INTO users(username, password_hash, role) VALUES (%s, %s, %s) "
                "ON CONFLICT(username) DO UPDATE SET "
                "password_hash = excluded.password_hash, role = excluded.role",
                (username, password_hash(password), role),
            )
        return {"username": username, "password": password, "role": role}

    return _make_user


@pytest.fixture()
def make_session(make_user):
    def _make_session(
        username,
        role="player",
        token=None,
        password="password-123",
        expires_at=None,
    ):
        user = make_user(username, password=password, role=role)
        token_value = token or f"tok-{username}"
        with db_module.db() as conn:
            conn.execute(
                "INSERT INTO sessions(token, username, role, expires_at) VALUES (%s, %s, %s, %s) "
                "ON CONFLICT(token) DO UPDATE SET username = excluded.username, "
                "role = excluded.role, expires_at = excluded.expires_at",
                (token_value, username, role, expires_at or "2999-01-01 00:00:00"),
            )
        return {**user, "token": token_value}

    return _make_session


class NativeAuthProbe:
    """Keeps the legacy test vocabulary while exercising the native router."""

    def __init__(self, client: TestClient, payload=None, token=None):
        self.client = client
        self.request_payload = payload or {}
        self.token = token
        self.status = None
        self.payload = None
        self._session_cache = None
        self._session_resolved = False

    @property
    def headers(self):
        return {"Authorization": f"Bearer {self.token}"} if self.token else {}

    def _request(self, method: str, path: str):
        response = self.client.request(
            method,
            path,
            headers=self.headers,
            json=self.request_payload if method == "POST" else None,
        )
        self.status = response.status_code
        self.payload = response.json()

    def _post_login(self):
        self._request("POST", "/api/login")

    def _post_register(self):
        self._request("POST", "/api/register")

    def _post_logout(self):
        self._request("POST", "/api/logout")

    def _post_users(self):
        self._request("POST", "/api/users")

    def _delete_user(self, username: str):
        self._request("DELETE", f"/api/users/{username}")

    def _post_google_login(self):
        self._request("POST", "/api/auth/google")

    def _post_users_me(self, _session):
        self._request("POST", "/api/users/me")

    def current_session(self):
        if not self._session_resolved:
            response = self.client.get("/api/session", headers=self.headers)
            body = response.json()
            self._session_cache = body.get("user") if body.get("authenticated") else None
            self._session_resolved = True
        return self._session_cache


@pytest.fixture()
def auth_handler(db_path):
    with TestClient(create_app()) as client:

        def _handler(payload=None, token=None):
            return NativeAuthProbe(client, payload=payload, token=token)

        yield _handler


class NativeCampaignProbe:
    """HTTP probe for campaign router regression tests."""

    def __init__(self, client: TestClient, payload=None, token=None, path="/api/campaigns"):
        self.client = client
        self.request_payload = payload or {}
        self.token = token
        self.path = path
        self.status = None
        self.payload = None

    def _request(self, method: str, path: str):
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        response = self.client.request(
            method,
            path,
            headers=headers,
            json=self.request_payload if method == "POST" else None,
        )
        self.status = response.status_code
        self.payload = response.json()

    def _post_campaigns(self):
        self._request("POST", "/api/campaigns")

    def _post_campaign_invite(self, campaign_id: str):
        self._request("POST", f"/api/campaigns/{campaign_id}/invite")

    def route_campaign_post(self, path: str) -> bool:
        if path != "/api/campaigns":
            return False
        self._request("POST", path)
        return True

    def route_campaign_delete(self, path: str) -> bool:
        if "/invites/" not in path:
            return False
        self._request("DELETE", path)
        return True


@pytest.fixture()
def campaign_handler(db_path):
    with TestClient(create_app()) as client:

        def _handler(payload=None, token=None, path="/api/campaigns"):
            return NativeCampaignProbe(client, payload=payload, token=token, path=path)

        yield _handler
