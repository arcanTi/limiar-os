"""Temporary control of an absent player's sheet.

A player who does not show up leaves their character behind; the GM can hand it
to someone else at the table for as long as it takes, and take it back. What is
handed over is control, never ownership.
"""

from http import HTTPStatus

import pytest
from conftest import seed_session_users

from backend.application.campaigns import CampaignService
from backend.application.characters import CharacterService
from backend.application.errors import ApplicationError
from backend.repositories import campaign_sync, campaigns, records
from backend.repositories.adapters import PostgresRecordRepository

GM = {"username": "gm1", "role": "gm"}
OTHER_GM = {"username": "other-gm", "role": "gm"}
ABSENT = {"username": "alice", "role": "player"}
STANDIN = {"username": "bob", "role": "player"}
OUTSIDER = {"username": "outsider", "role": "player"}


@pytest.fixture(autouse=True)
def _fk_users(db_path):
    seed_session_users()


@pytest.fixture()
def table(db_conn):
    """A campaign with two seated players, each holding their own sheet."""
    campaign = campaigns.upsert_campaign({"name": "Noite em Watson", "visibility": "public"}, GM)
    for session, character_id, name in (
        (ABSENT, "alice-op", "Alice Op"),
        (STANDIN, "bob-op", "Bob Op"),
    ):
        records.upsert_record(
            "characters",
            {"id": character_id, "name": name, "ownerUsername": session["username"]},
        )
        campaigns.join_campaign(campaign["id"], character_id, session)
    return campaign["id"]


def service() -> CampaignService:
    return CampaignService(campaigns, records, campaign_sync)


def character_service() -> CharacterService:
    return CharacterService(PostgresRecordRepository(), campaigns)


def characters_for(session) -> list[str]:
    return [row["id"] for row in character_service().list(session)]


def test_delegated_sheet_reaches_the_stand_in_and_leaves_when_revoked(table):
    assert characters_for(STANDIN) == ["bob-op"]

    service().grant_control(table, "alice-op", STANDIN["username"], GM)

    assert sorted(characters_for(STANDIN)) == ["alice-op", "bob-op"]
    # The absent player keeps their own sheet the whole time.
    assert characters_for(ABSENT) == ["alice-op"]

    assert service().revoke_control(table, "alice-op", GM) is True
    assert characters_for(STANDIN) == ["bob-op"]


def test_stand_in_plays_the_sheet_without_inheriting_it(table):
    service().grant_control(table, "alice-op", STANDIN["username"], GM)
    sheets = character_service()

    fetched = sheets.get("alice-op", STANDIN)
    saved = sheets.save_as_player(
        {
            **fetched,
            "name": "Alice Op",
            "notes": "levou 12 de dano",
            # Optimistic concurrency applies to a stand-in exactly as it does to
            # the owner: covering a sheet is not a way around the revision gate.
            "expectedRevision": fetched["revision"],
        },
        STANDIN,
    )

    assert saved["notes"] == "levou 12 de dano"
    assert saved["ownerUsername"] == ABSENT["username"]


def test_notes_patch_follows_the_same_control_rule(table):
    sheets = character_service()
    with pytest.raises(ApplicationError) as denied:
        sheets.patch_notes("alice-op", {"notes": "invadido"}, STANDIN)
    assert denied.value.status == HTTPStatus.FORBIDDEN

    service().grant_control(table, "alice-op", STANDIN["username"], GM)
    current = sheets.get("alice-op", STANDIN)
    patched = sheets.patch_notes(
        "alice-op",
        {"notes": "cobriu o turno", "expectedRevision": current["revision"]},
        STANDIN,
    )

    assert patched["notes"] == "cobriu o turno"
    assert patched["ownerUsername"] == ABSENT["username"]


def test_revoked_control_closes_reads_and_writes(table):
    service().grant_control(table, "alice-op", STANDIN["username"], GM)
    service().revoke_control(table, "alice-op", GM)
    sheets = character_service()

    with pytest.raises(ApplicationError) as read_denied:
        sheets.get("alice-op", STANDIN)
    with pytest.raises(ApplicationError) as write_denied:
        sheets.save_as_player({"id": "alice-op", "name": "Alice Op"}, STANDIN)

    assert read_denied.value.status == HTTPStatus.FORBIDDEN
    assert write_denied.value.status == HTTPStatus.FORBIDDEN


def test_only_the_gm_of_this_table_delegates(table):
    for session in (OTHER_GM, STANDIN):
        with pytest.raises(ApplicationError) as denied:
            service().grant_control(table, "alice-op", STANDIN["username"], session)
        assert denied.value.status == HTTPStatus.FORBIDDEN


def test_delegation_stays_inside_the_table(table):
    records.upsert_record(
        "characters",
        {"id": "unseated", "name": "Unseated", "ownerUsername": OUTSIDER["username"]},
    )

    with pytest.raises(ApplicationError) as unseated:
        service().grant_control(table, "unseated", STANDIN["username"], GM)
    with pytest.raises(ApplicationError) as stranger:
        service().grant_control(table, "alice-op", OUTSIDER["username"], GM)
    with pytest.raises(ApplicationError) as to_owner:
        service().grant_control(table, "alice-op", ABSENT["username"], GM)

    assert unseated.value.status == HTTPStatus.NOT_FOUND
    assert stranger.value.status == HTTPStatus.FORBIDDEN
    assert to_owner.value.status == HTTPStatus.BAD_REQUEST


def test_one_stand_in_per_sheet(table):
    records.upsert_record(
        "characters",
        {"id": "carol-op", "name": "Carol Op", "ownerUsername": "someone"},
    )
    campaigns.join_campaign(table, "carol-op", {"username": "someone", "role": "player"})

    service().grant_control(table, "alice-op", STANDIN["username"], GM)
    service().grant_control(table, "alice-op", "someone", GM)

    assert characters_for(STANDIN) == ["bob-op"]
    assert sorted(characters_for({"username": "someone", "role": "player"})) == [
        "alice-op",
        "carol-op",
    ]
    assert len(campaigns.list_delegations(table)) == 1


def test_roster_names_who_is_holding_the_sheet(table):
    service().grant_control(table, "alice-op", STANDIN["username"], GM)

    row = next(c for c in campaigns.list_campaigns_for(ABSENT) if c["id"] == table)
    seat = next(entry for entry in row["roster"] if entry["characterId"] == "alice-op")

    assert seat["username"] == ABSENT["username"]
    assert seat["controlledBy"] == STANDIN["username"]
    assert row["delegations"][0]["grantedBy"] == GM["username"]
    # The stand-in's own seat is untouched.
    own = next(entry for entry in row["roster"] if entry["characterId"] == "bob-op")
    assert own["controlledBy"] is None


def test_roster_seats_carry_the_character_class_and_level(table):
    """The desktop reads the table as characters, so class and level ride along.

    Nothing else from the sheet does: `/api/characters` stays owner-scoped.
    """
    records.upsert_record(
        "characters",
        {
            "id": "alice-op",
            "name": "Alice Op",
            "ownerUsername": ABSENT["username"],
            "role": "Nomad",
            "level": 3,
            "credits": 4200,
        },
    )

    row = next(c for c in campaigns.list_campaigns_for(STANDIN) if c["id"] == table)
    seat = next(entry for entry in row["roster"] if entry["characterId"] == "alice-op")

    assert seat["characterName"] == "Alice Op"
    assert seat["characterRole"] == "Nomad"
    assert seat["characterLevel"] == 3
    assert "credits" not in seat

    gm_seat = next(entry for entry in row["roster"] if entry["username"] == GM["username"])
    assert gm_seat["characterRole"] is None
    assert gm_seat["characterLevel"] is None


def test_the_stand_in_leaving_the_table_ends_their_control(table):
    service().grant_control(table, "alice-op", STANDIN["username"], GM)
    campaigns.remove_member(table, STANDIN["username"])

    assert campaigns.list_delegations(table) == []
    assert characters_for(STANDIN) == ["bob-op"]


def test_the_seat_owner_leaving_the_table_takes_their_sheet_back(table):
    # The other direction: bob's own sheet was being covered, and bob leaves.
    service().grant_control(table, "bob-op", ABSENT["username"], GM)
    assert sorted(characters_for(ABSENT)) == ["alice-op", "bob-op"]

    campaigns.remove_member(table, STANDIN["username"])

    assert campaigns.list_delegations(table) == []
    assert characters_for(ABSENT) == ["alice-op"]


def test_staff_still_sees_every_sheet(table):
    service().grant_control(table, "alice-op", STANDIN["username"], GM)
    assert sorted(characters_for({"username": "admin", "role": "admin"})) == [
        "alice-op",
        "bob-op",
    ]
