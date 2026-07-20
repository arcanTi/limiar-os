import io
import json
from http import HTTPStatus

import pytest

from backend import db as db_module
from backend.api.auth import AuthRoutes
from backend.api.base import BaseHandler
from backend.api.campaigns import CampaignRoutes
from backend.security import password_hash


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    monkeypatch.setattr(db_module, "DATA_DIR", tmp_path)
    monkeypatch.setattr(db_module, "UPLOAD_DIR", tmp_path / "uploads")
    monkeypatch.setattr(db_module, "DB_PATH", tmp_path / "limiar-test.db")
    monkeypatch.setattr(db_module, "load_seed_file", lambda: dict(db_module.EMPTY_SEED))
    db_module.init_db()
    return db_module.DB_PATH


@pytest.fixture()
def db_conn(db_path):
    with db_module.db() as conn:
        yield conn


@pytest.fixture()
def make_user(db_path):
    def _make_user(username, password="password-123", role="player"):
        with db_module.db() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO users(username, password_hash, role) VALUES (?, ?, ?)",
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
                "INSERT OR REPLACE INTO sessions(token, username, role, expires_at)"
                " VALUES (?, ?, ?, ?)",
                (token_value, username, role, expires_at or "2999-01-01 00:00:00"),
            )
        return {**user, "token": token_value}

    return _make_session


class FakeAuthHandler(AuthRoutes, BaseHandler):
    def __init__(self, payload=None, token=None):
        body = json.dumps(payload or {}).encode("utf-8")
        self.headers = {"Content-Length": str(len(body))}
        if token:
            self.headers["Authorization"] = f"Bearer {token}"
        self.rfile = io.BytesIO(body)
        self.client_address = ("127.0.0.1", 12345)
        self.status = None
        self.response_headers = []
        self.payload = None

    def send_response(self, status, message=None):
        self.status = status

    def send_header(self, key, value):
        self.response_headers.append((key, value))

    def end_headers(self):
        return None

    def write_json(self, payload, status=HTTPStatus.OK):
        self.status = status
        self.payload = payload


@pytest.fixture()
def auth_handler(db_path):
    def _handler(payload=None, token=None):
        return FakeAuthHandler(payload=payload, token=token)

    return _handler


class FakeCampaignHandler(CampaignRoutes, BaseHandler):
    def __init__(self, payload=None, token=None, path="/api/campaigns"):
        body = json.dumps(payload or {}).encode("utf-8")
        self.headers = {"Content-Length": str(len(body))}
        if token:
            self.headers["Authorization"] = f"Bearer {token}"
        self.rfile = io.BytesIO(body)
        self.client_address = ("127.0.0.1", 12345)
        self.path = path
        self.status = None
        self.response_headers = []
        self.payload = None

    def send_response(self, status, message=None):
        self.status = status

    def send_header(self, key, value):
        self.response_headers.append((key, value))

    def end_headers(self):
        return None

    def write_json(self, payload, status=HTTPStatus.OK):
        self.status = status
        self.payload = payload


@pytest.fixture()
def campaign_handler(db_path):
    def _handler(payload=None, token=None, path="/api/campaigns"):
        return FakeCampaignHandler(payload=payload, token=token, path=path)

    return _handler
