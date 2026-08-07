"""Fast, database-free coverage for application-layer policies."""

from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest

from backend.application.campaign_events import CampaignEventService
from backend.application.campaign_maps import CampaignMapService
from backend.application.characters import CharacterService
from backend.application.errors import ApplicationError
from backend.application.game_state import GameStateService
from backend.application.sessions import SessionService


class MemoryRecords:
    def __init__(self, rows=None):
        self.rows = rows or {}

    def list(self, kind):
        return list(self.rows.get(kind, {}).values())

    def get(self, kind, record_id):
        return self.rows.get(kind, {}).get(record_id)

    def upsert(self, kind, payload):
        self.rows.setdefault(kind, {})[payload["id"]] = payload
        return payload

    def delete(self, kind, record_id):
        return self.rows.get(kind, {}).pop(record_id, None) is not None


class MemorySettings:
    def __init__(self, rows=None):
        self.rows = rows or {}

    def get(self, key):
        return self.rows.get(key)

    def set(self, key, payload):
        self.rows[key] = payload
        return payload


class MemoryIdentity:
    def __init__(self, sessions=None):
        self.sessions = sessions or {}
        self.deleted = []
        self.renewed = []

    @contextmanager
    def transaction(self):
        yield self

    def session_by_token(self, token):
        return self.sessions.get(token)

    def delete_session(self, token):
        self.deleted.append(token)
        self.sessions.pop(token, None)

    def renew_session(self, token, expires_at):
        self.renewed.append((token, expires_at))
        self.sessions[token]["expires_at"] = expires_at


class MemoryCampaignEvents:
    def __init__(self):
        self.listener = None

    def subscribe(self, listener):
        self.listener = listener
        return lambda: None

    @staticmethod
    def snapshot_since(_campaign_id, since):
        return {"version": since + 1, "changed": True, "topics": ["map"]}

    @staticmethod
    def current_version(_campaign_id):
        return 7


def test_character_query_projects_only_owned_sheets_for_player():
    records = MemoryRecords({"characters": {
        "mine": {"id": "mine", "ownerUsername": "ana"},
        "other": {"id": "other", "ownerUsername": "bruno"},
    }})
    service = CharacterService(records)
    assert [row["id"] for row in service.list({"username": "ana", "role": "player"})] == ["mine"]


def test_character_service_stamps_schema_and_owner():
    records = MemoryRecords()
    service = CharacterService(records)
    saved = service.save_as_player(
        {"id": "ana-sheet", "name": "Ana"},
        {"username": "ana", "role": "player"},
    )
    assert saved["schemaVersion"] == 1
    assert saved["ownerUsername"] == "ana"


def test_end_turn_policy_advances_owned_combatant():
    records = MemoryRecords({"characters": {"ana": {"id": "ana", "ownerUsername": "ana"}}})
    settings = MemorySettings({"combat-state": {
        "active": True,
        "round": 1,
        "turnIndex": 0,
        "order": ["ana"],
        "combatants": {"ana": {"defeated": False}},
    }})
    service = GameStateService(settings, records)
    result = service.end_turn("ana", {"username": "ana", "role": "player"})
    assert result["round"] == 2
    assert result["turnIndex"] == 0


def test_end_turn_rejects_another_players_character():
    records = MemoryRecords({"characters": {"ana": {"id": "ana", "ownerUsername": "ana"}}})
    service = GameStateService(MemorySettings({"combat-state": {}}), records)
    with pytest.raises(ApplicationError, match="Not your combatant"):
        service.end_turn("ana", {"username": "bruno", "role": "player"})


def test_campaign_map_service_checks_membership_and_editor_role():
    class Campaigns:
        @staticmethod
        def get_campaign(_campaign_id):
            return {"id": "mesa"}

        @staticmethod
        def is_campaign_member(_campaign_id, session):
            return session["username"] == "ana"

    service = CampaignMapService(object(), Campaigns())
    service.ensure_access("mesa", {"username": "ana", "role": "player"})
    with pytest.raises(ApplicationError, match="GM login required"):
        service.ensure_editor("mesa", {"username": "ana", "role": "player"})


def test_session_service_expires_and_removes_stale_session():
    now = datetime(2026, 8, 6, 12, tzinfo=UTC)
    identity = MemoryIdentity({"old": {
        "token": "old",
        "username": "ana",
        "role": "player",
        "avatar_url": None,
        "remember": 0,
        "expires_at": now - timedelta(seconds=1),
    }})
    service = SessionService(identity, 3600, 7200, 300)

    assert service.resolve("old", now=now) is None
    assert identity.deleted == ["old"]


def test_session_service_renews_once_inside_touch_window():
    now = datetime(2026, 8, 6, 12, tzinfo=UTC)
    identity = MemoryIdentity({"live": {
        "token": "live",
        "username": "ana",
        "role": "gm",
        "avatar_url": "/uploads/ana.png",
        "remember": 0,
        "expires_at": now + timedelta(seconds=3200),
    }})
    service = SessionService(identity, 3600, 7200, 300)

    session = service.resolve("live", now=now)

    assert session["username"] == "ana"
    assert session["avatarUrl"] == "/uploads/ana.png"
    assert identity.renewed == [("live", now + timedelta(seconds=3600))]


def test_campaign_event_service_authorizes_and_hides_adapters():
    now = datetime(2026, 8, 6, 12, tzinfo=UTC)
    identity = MemoryIdentity({"token": {
        "token": "token",
        "username": "ana",
        "role": "player",
        "avatar_url": None,
        "remember": 0,
        "expires_at": now + timedelta(days=1),
    }})
    sessions = SessionService(identity, 3600, 7200, 300, clock=lambda: now)

    class Campaigns:
        @staticmethod
        def get_campaign(campaign_id):
            return {"id": campaign_id} if campaign_id == "mesa" else None

        @staticmethod
        def is_campaign_member(_campaign_id, session):
            return session["username"] == "ana"

    events = MemoryCampaignEvents()
    service = CampaignEventService(sessions, Campaigns(), events)

    assert service.authorize("token", "mesa")["username"] == "ana"
    assert service.snapshot("mesa", 2)["version"] == 3
    assert service.current_version("mesa") == 7
    with pytest.raises(ApplicationError, match="Campaign not found"):
        service.authorize("token", "missing")
    with pytest.raises(ApplicationError, match="Authentication required"):
        service.authorize("missing-token", "mesa")
