"""PostgreSQL referential-integrity and transaction-boundary coverage."""

import psycopg
import pytest
from conftest import seed_session_users

from backend.db import db
from backend.repositories import campaign_maps as maps
from backend.repositories import campaigns as camp


def test_every_connection_is_postgres(db_path):
    with db() as conn:
        version = conn.execute("SHOW server_version_num").fetchone()["server_version_num"]
        assert int(version) >= 140000


def test_transaction_rolls_back_after_failure(db_path):
    message = "rollback probe"
    with pytest.raises(RuntimeError, match=message), db() as conn:
        conn.execute(
            "INSERT INTO users(username, access_token, role) "
            "VALUES ('rollback-user', 'RB1234', 'player')"
        )
        raise RuntimeError(message)
    with db() as conn:
        row = conn.execute(
            "SELECT username FROM users WHERE username = 'rollback-user'"
        ).fetchone()
    assert row is None


def test_child_row_cannot_reference_a_missing_campaign(db_path):
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        maps.upsert_token("campanha-que-nao-existe", {"name": "Fantasma", "x": 1, "y": 1})


def test_membership_cannot_reference_a_missing_user(db_path):
    seed_session_users(["dono"])
    gm = {"username": "dono", "role": "gm"}
    campaign = camp.upsert_campaign({"name": "Mesa Real", "visibility": "private"}, gm)
    with pytest.raises(psycopg.errors.ForeignKeyViolation):
        camp.join_campaign(
            campaign["id"],
            "ficha-x",
            {"username": "usuario-inexistente", "role": "player"},
        )


def test_deleting_a_campaign_cascades_to_its_map(db_path):
    seed_session_users(["dono"])
    gm = {"username": "dono", "role": "gm"}
    campaign = camp.upsert_campaign({"name": "Mesa Efemera", "visibility": "private"}, gm)
    maps.upsert_token(campaign["id"], {"name": "Alvo", "x": 5, "y": 5})

    with db() as conn:
        antes = conn.execute(
            "SELECT COUNT(*) AS count FROM campaign_map_tokens WHERE campaign_id = %s",
            (campaign["id"],),
        ).fetchone()["count"]
        assert antes == 1
        conn.execute("DELETE FROM campaigns WHERE id = %s", (campaign["id"],))
        depois = conn.execute(
            "SELECT COUNT(*) AS count FROM campaign_map_tokens WHERE campaign_id = %s",
            (campaign["id"],),
        ).fetchone()["count"]

    # PostgreSQL enforces the schema's ON DELETE CASCADE constraints.
    assert depois == 0


def test_deleting_a_user_clears_the_rows_that_have_no_cascade(db_path, auth_handler, make_session):
    """Delete dependent rows explicitly when their user FKs do not cascade."""
    admin = make_session("admin-fk", role="admin")
    make_session("descartavel", role="player")
    seed_session_users(["dono-fk"])
    gm = {"username": "dono-fk", "role": "gm"}
    campaign = camp.upsert_campaign({"name": "Mesa FK", "visibility": "public"}, gm)
    player = {"username": "descartavel", "role": "player"}
    camp.join_campaign(campaign["id"], "ficha-descartavel", player)

    handler = auth_handler(token=admin["token"])
    handler.path = "/api/users/descartavel"
    handler._delete_user("descartavel")

    assert handler.payload == {"deleted": True}
    with db() as conn:
        users_left = conn.execute(
            "SELECT COUNT(*) AS count FROM users WHERE username = 'descartavel'",
        ).fetchone()["count"]
        assert users_left == 0
        members_left = conn.execute(
            "SELECT COUNT(*) AS count FROM campaign_members WHERE username = 'descartavel'",
        ).fetchone()["count"]
        assert members_left == 0


def test_seeded_database_has_no_violations(db_path):
    with db() as conn:
        invalid = conn.execute(
            "SELECT COUNT(*) AS count FROM pg_constraint WHERE contype = 'f' AND NOT convalidated"
        ).fetchone()["count"]
    assert invalid == 0
