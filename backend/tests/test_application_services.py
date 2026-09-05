"""Fast, database-free coverage for application-layer policies."""

from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest

from backend.application.campaign_events import CampaignEventService
from backend.application.campaign_maps import CampaignMapService
from backend.application.campaigns import CampaignService
from backend.application.characters import CharacterService
from backend.application.errors import ApplicationError
from backend.application.game_state import GameStateService
from backend.application.sessions import SessionService
from backend.domain.validation import ValidationError

ALL_STATS = ("INT", "REF", "DEX", "TECH", "COOL", "WILL", "LUCK", "MOVE", "BODY", "EMP")


class MemoryRecords:
    def __init__(self, rows=None):
        self.rows = rows or {}

    def list(self, kind, campaign_id=None):
        rows = list(self.rows.get(kind, {}).values())
        if campaign_id is None:
            return rows
        return [row for row in rows if str(row.get("campaignId") or "") == campaign_id]

    def get(self, kind, record_id):
        return self.rows.get(kind, {}).get(record_id)

    def upsert(self, kind, payload):
        self.rows.setdefault(kind, {})[payload["id"]] = payload
        return payload

    def upsert_revisioned(self, kind, payload, expected_revision):
        current = self.get(kind, payload["id"])
        if current and expected_revision != current.get("revision", 0):
            raise ApplicationError(409, "stale", "REVISION_CONFLICT")
        saved = {**payload, "revision": (current or {}).get("revision", -1) + 1}
        self.rows.setdefault(kind, {})[payload["id"]] = saved
        return saved

    def delete(self, kind, record_id):
        return self.rows.get(kind, {}).pop(record_id, None) is not None


class MemorySettings:
    def __init__(self, rows=None):
        self.rows = rows or {}

    def get(self, campaign_id, key):
        return self.rows.get((campaign_id, key))

    def set(self, campaign_id, key, payload, expected_revision=None):
        current = self.get(campaign_id, key)
        if (
            expected_revision is not None
            and expected_revision != (current or {}).get("revision", 0)
        ):
            raise ApplicationError(409, "stale", "REVISION_CONFLICT")
        saved = (
            {**payload, "revision": (current or {}).get("revision", -1) + 1}
            if isinstance(payload, dict)
            else payload
        )
        self.rows[(campaign_id, key)] = saved
        return saved


class MemoryCampaigns:
    def __init__(self, campaign_ids=("mesa",), members=None, owners=None, joinable=()):
        self.campaign_ids = set(campaign_ids)
        # None keeps the permissive default the older tests rely on.
        self.members = members
        self.owners = owners
        self.joinable = set(joinable)

    def get_campaign(self, campaign_id):
        return {"id": campaign_id} if campaign_id in self.campaign_ids else None

    def is_campaign_member(self, campaign_id, session):
        if self.members is None:
            return True
        return session["username"] in self.members.get(campaign_id, ())

    def is_campaign_owner(self, campaign_id, session):
        if self.owners is None:
            return True
        return session["username"] in self.owners.get(campaign_id, ())

    def list_campaigns_for(self, session):
        return [
            {
                "id": campaign_id,
                "canJoin": campaign_id in self.joinable,
                "isMember": self.is_campaign_member(campaign_id, session),
            }
            for campaign_id in sorted(self.campaign_ids)
        ]

    def join_campaign(self, campaign_id, character_id, session):
        if self.members is not None:
            self.members.setdefault(campaign_id, set()).add(session["username"])
        return {
            "campaign_id": campaign_id,
            "username": session["username"],
            "character_id": character_id,
        }


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
    service = CharacterService(records, MemoryCampaigns())
    assert [row["id"] for row in service.list({"username": "ana", "role": "player"})] == ["mine"]


def test_character_service_stamps_schema_and_owner():
    records = MemoryRecords()
    service = CharacterService(records, MemoryCampaigns())
    saved = service.save_as_player(
        {"id": "ana-sheet", "name": "Ana"},
        {"username": "ana", "role": "player"},
    )
    assert saved["schemaVersion"] == 1
    assert saved["ownerUsername"] == "ana"


def test_player_creation_rejects_an_illegal_stat_spread():
    service = CharacterService(MemoryRecords(), MemoryCampaigns())
    with pytest.raises(ValidationError):
        service.save_as_player(
            {"id": "cheater", "name": "Cheater", "base": dict.fromkeys(ALL_STATS, 10)},
            {"username": "ana", "role": "player"},
        )


def test_player_update_of_an_existing_sheet_is_not_held_to_creation_limits():
    grown = dict.fromkeys(ALL_STATS, 10)
    sheet = {"id": "vet", "name": "Vet", "ownerUsername": "ana", "revision": 0}
    records = MemoryRecords({"characters": {"vet": sheet}})
    service = CharacterService(records, MemoryCampaigns())
    saved = service.save_as_player(
        {"id": "vet", "name": "Vet", "base": grown, "expectedRevision": 0},
        {"username": "ana", "role": "player"},
    )
    assert saved["base"] == grown


def _two_table_records():
    return MemoryRecords({"characters": {
        "alpha-pc": {"id": "alpha-pc", "ownerUsername": "ana", "campaignId": "alpha"},
        "beta-pc": {"id": "beta-pc", "ownerUsername": "bruno", "campaignId": "beta"},
        "demo": {"id": "demo", "name": "NOVA"},
    }})


def test_gm_reads_only_the_sheets_of_the_table_they_run():
    """Regression: every GM used to read every player's sheet on the deployment."""
    campaigns = MemoryCampaigns(
        campaign_ids=("alpha", "beta"),
        members={"alpha": {"ana"}, "beta": {"gm-beta", "bruno"}},
        owners={"alpha": set(), "beta": {"gm-beta"}},
    )
    service = CharacterService(_two_table_records(), campaigns)
    gm_beta = {"username": "gm-beta", "role": "gm"}

    assert [row["id"] for row in service.list(gm_beta, "beta")] == ["beta-pc"]
    assert service.list(gm_beta, "alpha") == []
    with pytest.raises(ApplicationError, match="Character access denied"):
        service.get("alpha-pc", gm_beta)
    with pytest.raises(ApplicationError, match="mestre desta campanha"):
        service.delete("alpha-pc", gm_beta)


def test_unscoped_listing_hides_sheets_that_belong_to_a_table():
    campaigns = MemoryCampaigns(campaign_ids=("alpha", "beta"))
    service = CharacterService(_two_table_records(), campaigns)

    rows = service.list({"username": "root", "role": "admin"})
    assert [row["id"] for row in rows] == ["demo"]


def test_staff_can_delete_the_seeded_demo_sheets():
    records = _two_table_records()
    campaigns = MemoryCampaigns(campaign_ids=("alpha",), owners={"alpha": set()})
    service = CharacterService(records, campaigns)

    assert service.delete("demo", {"username": "gm", "role": "gm"}) is True
    assert records.get("characters", "demo") is None


def test_new_sheet_takes_the_campaign_of_the_request():
    records = MemoryRecords()
    campaigns = MemoryCampaigns(
        campaign_ids=("alpha",),
        members={"alpha": {"ana"}},
    )
    service = CharacterService(records, campaigns)

    saved = service.save_as_player(
        {"id": "ana-sheet", "name": "Ana"},
        {"username": "ana", "role": "player"},
        "alpha",
    )
    assert saved["campaignId"] == "alpha"


def test_a_saved_sheet_cannot_be_moved_to_another_table():
    records = _two_table_records()
    campaigns = MemoryCampaigns(
        campaign_ids=("alpha", "beta"),
        members={"alpha": {"ana"}, "beta": {"ana"}},
    )
    service = CharacterService(records, campaigns)

    saved = service.save_as_player(
        {"id": "alpha-pc", "name": "Ana", "campaignId": "beta", "expectedRevision": 0},
        {"username": "ana", "role": "player"},
        "beta",
    )
    assert saved["campaignId"] == "alpha"


def test_first_sheet_can_be_written_before_the_join_completes():
    """Onboarding creates the sheet first: the join needs a character id."""
    campaigns = MemoryCampaigns(
        campaign_ids=("open", "closed"),
        members={"open": set(), "closed": set()},
        joinable=("open",),
    )
    service = CharacterService(MemoryRecords(), campaigns)
    newbie = {"username": "newbie", "role": "player"}

    saved = service.save_as_player({"id": "newbie-pc", "name": "Newbie"}, newbie, "open")
    assert saved["campaignId"] == "open"

    with pytest.raises(ApplicationError, match="Campaign access denied"):
        service.save_as_player({"id": "sneak", "name": "Sneak"}, newbie, "closed")


def test_seated_player_can_join_again_with_another_own_sheet():
    """Creating a new operative inside a table re-seats the player with it."""
    records = MemoryRecords({"characters": {
        "ana-old": {"id": "ana-old", "ownerUsername": "ana"},
        "ana-new": {"id": "ana-new", "ownerUsername": "ana"},
        "bruno-pc": {"id": "bruno-pc", "ownerUsername": "bruno"},
    }})
    campaigns = MemoryCampaigns(campaign_ids=("mesa",), members={"mesa": {"ana"}}, joinable=())
    service = CampaignService(campaigns, records, events=None)
    ana = {"username": "ana", "role": "player"}

    seat = service.join("mesa", "ana-new", ana)
    assert seat["character_id"] == "ana-new"

    # Membership does not open the table to someone who was never let in.
    with pytest.raises(ApplicationError, match="Campaign access denied"):
        service.join("mesa", "bruno-pc", {"username": "bruno", "role": "player"})
    # Nor does it let the seated player bring someone else's sheet.
    with pytest.raises(ApplicationError, match="Character access denied"):
        service.join("mesa", "bruno-pc", ana)


def test_end_turn_policy_advances_owned_combatant():
    records = MemoryRecords({"characters": {"ana": {"id": "ana", "ownerUsername": "ana"}}})
    settings = MemorySettings({("mesa", "combat-state"): {
        "active": True,
        "round": 1,
        "turnIndex": 0,
        "order": ["ana"],
        "combatants": {"ana": {"defeated": False}},
    }})
    service = GameStateService(settings, records, MemoryCampaigns())
    result = service.end_turn("mesa", "ana", 0, {"username": "ana", "role": "player"})
    assert result["round"] == 2
    assert result["turnIndex"] == 0


def test_end_turn_rejects_another_players_character():
    records = MemoryRecords({"characters": {"ana": {"id": "ana", "ownerUsername": "ana"}}})
    settings = MemorySettings({("mesa", "combat-state"): {}})
    service = GameStateService(settings, records, MemoryCampaigns())
    with pytest.raises(ApplicationError, match="Not your combatant"):
        service.end_turn("mesa", "ana", 0, {"username": "bruno", "role": "player"})


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
    now = datetime.now(UTC)
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
