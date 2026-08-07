"""Use native JSONB for flexible documents.

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

_DOCUMENT_COLUMNS = (
    ("records", "data", "{}"),
    ("settings", "data", None),
    ("characters", "extra", "{}"),
    ("items", "extra", "{}"),
    ("map_locations", "extra", "{}"),
    ("assets", "extra", "{}"),
    ("chat_messages", "extra", "{}"),
    ("campaign_map_scenes", "difficult_terrain", "[]"),
    ("campaign_map_drawings", "points", "[]"),
)


def upgrade() -> None:
    for table, column, default in _DOCUMENT_COLUMNS:
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} DROP DEFAULT")
        fallback = "null" if default is None else default
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN {column} TYPE JSONB "
            f"USING COALESCE(NULLIF({column}, ''), '{fallback}')::jsonb"
        )
        if default is not None:
            op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT '{default}'::jsonb")
    op.execute("DROP TABLE IF EXISTS schema_meta")


def downgrade() -> None:
    for table, column, default in reversed(_DOCUMENT_COLUMNS):
        op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TEXT USING {column}::text")
        if default is not None:
            op.execute(f"ALTER TABLE {table} ALTER COLUMN {column} SET DEFAULT '{default}'")
