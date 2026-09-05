"""Bind each character to the campaign it was created in.

Characters used to be a single global pool: `GET /api/characters` returned
every row to any GM, so a player's sheet from one table showed up at every
other table on the deployment. The column added here is what makes a character
belong somewhere.

Existing sheets are backfilled from `campaign_members.character_id`, which
already records which campaign a character was taken into. Anything with no
membership — the seeded NOVA/BYTE/IRIS demo trio included — stays NULL and is
only visible outside a campaign.

Revision ID: 0007
Revises: 0006
"""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE characters ADD COLUMN IF NOT EXISTS campaignid TEXT")
    op.execute(
        """
        UPDATE characters c
        SET campaignid = m.campaign_id
        FROM campaign_members m
        WHERE m.character_id = c.id AND c.campaignid IS NULL
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_characters_campaignid ON characters(campaignid)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_characters_campaignid")
    op.execute("ALTER TABLE characters DROP COLUMN IF EXISTS campaignid")
