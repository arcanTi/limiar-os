"""Temporary control of an absent player's character.

A player who misses a session can have their sheet handed to someone else at
the table. The grant lives here rather than on `campaign_members` because it is
not membership: the absent player keeps their seat and their ownership, and the
substitute gains control of one extra character without joining twice.

The grant has no expiry column on purpose — it ends when the GM revokes it.

Revision ID: 0008
Revises: 0007
"""
# ruff: noqa: E501

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE campaign_delegations (
          campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          character_id TEXT NOT NULL,
          username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
          granted_by TEXT NOT NULL,
          granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (campaign_id, character_id)
        )
    """)
    # Every character read by a player asks "which sheets do I control?", so the
    # lookup by substitute has to be indexed, not just the primary key.
    op.execute(
        "CREATE INDEX idx_campaign_delegations_username ON campaign_delegations(username)"
    )
    # A delegation is table state: players watching the campaign must see a
    # sheet appear or disappear from their control without reloading.
    op.execute("""
        CREATE OR REPLACE FUNCTION campaign_delegation_event_trigger()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM emit_campaign_event(COALESCE(NEW.campaign_id, OLD.campaign_id), 'roster');
          RETURN COALESCE(NEW, OLD);
        END $$
    """)
    op.execute(
        "CREATE TRIGGER campaign_delegation_event AFTER INSERT OR UPDATE OR DELETE ON campaign_delegations "
        "FOR EACH ROW EXECUTE FUNCTION campaign_delegation_event_trigger()"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS campaign_delegations CASCADE")
    op.execute("DROP FUNCTION IF EXISTS campaign_delegation_event_trigger() CASCADE")
