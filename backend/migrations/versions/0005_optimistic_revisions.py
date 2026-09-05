"""Add optimistic-concurrency revisions to mutable shared documents.

Revision ID: 0005
Revises: 0004
"""

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE campaign_settings ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE campaign_settings DROP COLUMN IF EXISTS revision")
    op.execute("ALTER TABLE characters DROP COLUMN IF EXISTS revision")
