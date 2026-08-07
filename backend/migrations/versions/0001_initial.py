"""Initial PostgreSQL schema.

Revision ID: 0001
"""
# ruff: noqa: TRY003, EM101

from pathlib import Path

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    schema = Path(__file__).resolve().parents[2] / "sql" / "postgres.sql"
    connection = op.get_bind()
    for statement in schema.read_text(encoding="utf-8").split(";"):
        if statement.strip():
            connection.exec_driver_sql(statement)


def downgrade() -> None:
    raise RuntimeError("The initial Limiar schema cannot be downgraded destructively")
