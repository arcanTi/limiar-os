"""PostgreSQL health and filesystem reference-data adapter."""

from ..db import db
from .records import get_reference


class PostgresMetadataRepository:
    """Serve database health and filesystem reference documents."""
    def health(self) -> dict[str, object]:
        with db() as conn:
            row = conn.execute(
                "SELECT current_database() AS database_name, "
                "pg_database_size(current_database()) AS database_bytes"
            ).fetchone()
        return {
            "ok": True,
            "database": {
                "engine": "postgresql",
                "name": row["database_name"],
                "bytes": row["database_bytes"],
                "sqliteImportSupported": False,
            },
        }

    def reference(self, name: str) -> object:
        return get_reference(name)
