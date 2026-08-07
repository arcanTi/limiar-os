"""Native psycopg connection pool, migrations, and seed bootstrap."""

import json
import logging
import os
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from pathlib import Path
from threading import Lock
from typing import Any, TypedDict

from .config import (
    DATABASE_URL,
    DEFAULT_GM_PASSWORD,
    DEFAULT_GM_USER,
    SEED_PATH,
)
from .security import password_hash
from .util import slug

_pool = None
_pool_url = ""
_pool_lock = Lock()


def database_url() -> str:
    """Read the live URL so test processes can select an isolated database."""
    return os.environ.get("LIMIAR_DATABASE_URL", DATABASE_URL).strip()


def using_postgres() -> bool:
    return database_url().startswith(("postgresql://", "postgresql+psycopg://"))


def _postgres_pool() -> Any:  # noqa: ANN401 - lazy ConnectionPool import
    global _pool, _pool_url
    url = database_url()
    if not using_postgres():
        message = "LIMIAR_DATABASE_URL must be a PostgreSQL URL"
        raise RuntimeError(message)
    with _pool_lock:
        if _pool is None or _pool_url != url:
            if _pool is not None:
                _pool.close()
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool

            # SQLAlchemy/Alembic URLs name the driver with ``+psycopg``;
            # libpq/psycopg itself accepts the canonical PostgreSQL scheme.
            conninfo = url.replace("postgresql+psycopg://", "postgresql://", 1)
            _pool = ConnectionPool(
                conninfo=conninfo,
                min_size=1,
                max_size=15,
                timeout=10,
                kwargs={"row_factory": dict_row},
                open=True,
            )
            _pool_url = url
    return _pool


def dispose_engine() -> None:
    """Close pooled connections after a database URL change in tests."""
    global _pool, _pool_url
    with _pool_lock:
        if _pool is not None:
            _pool.close()
        _pool = None
        _pool_url = ""


@contextmanager
def db() -> Iterator[Any]:
    """Yield one PostgreSQL transaction and always return its connection."""
    with _postgres_pool().connection() as connection, connection.transaction():
        yield connection


EMPTY_SEED: dict[str, list[dict[str, object]]] = {
    "characters": [],
    "items": [],
    "mapLocations": [],
    "gear": [],
}


def load_seed_file() -> dict[str, list[dict[str, object]]]:
    try:
        payload = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        logging.warning("[limiar] seed file missing: %s", SEED_PATH)
        return dict(EMPTY_SEED)
    except (json.JSONDecodeError, OSError):
        logging.exception("[limiar] seed load failed")
        return dict(EMPTY_SEED)
    return {key: payload.get(key) or [] for key in EMPTY_SEED}


class DomainConfig(TypedDict):
    """Typed-table persistence metadata."""

    table: str
    typed: tuple[str, ...]


_DOMAIN: dict[str, DomainConfig] = {
    "characters": {"table": "characters", "typed": ("id", "name", "role", "level")},
    "items": {"table": "items", "typed": ("id", "code", "name", "cat", "price", "stock")},
    "map": {"table": "map_locations", "typed": ("id", "name", "threat")},
    "assets": {
        "table": "assets",
        "typed": ("id", "name", "scope", "ownerId", "type", "url"),
    },
}
_ALLOWED_TABLES: frozenset[str] = frozenset(cfg["table"] for cfg in _DOMAIN.values())


def _row_to_dict(row: Mapping[str, object], typed_cols: tuple[str, ...]) -> dict[str, object]:
    data = {
        column: row[column.lower()]
        for column in typed_cols
        if row.get(column.lower()) is not None
    }
    data.setdefault("id", row["id"])
    raw_extra = row["extra"] or {}
    extra_data: dict[str, object] = (
        raw_extra if isinstance(raw_extra, dict) else json.loads(str(raw_extra))
    )
    return {**data, **extra_data}


def _dict_to_upsert(
    payload: dict[str, object],
    cfg: DomainConfig,
) -> tuple[str, dict[str, object], str]:
    typed = cfg["typed"]
    record_id = str(payload.get("id") or payload.get("code") or slug(payload.get("name")))
    params: dict[str, object] = {"id": record_id}
    for column in typed:
        if column != "id":
            params[column] = payload.get(column)
    params["extra"] = json.dumps(
        {key: value for key, value in payload.items() if key not in set(typed)},
        ensure_ascii=False,
    )
    columns = [*list(typed), "extra"]
    column_sql = ", ".join(columns)
    placeholders = ", ".join(f"%({column})s" for column in columns)
    updates = ", ".join(f"{column}=excluded.{column}" for column in columns if column != "id")
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        message = f"unknown table: {table}"
        raise RuntimeError(message)
    sql = (
        f"INSERT INTO {table}({column_sql}) VALUES ({placeholders})"  # noqa: S608
        f" ON CONFLICT(id) DO UPDATE SET {updates}, updated_at=CURRENT_TIMESTAMP"
    )
    return record_id, params, sql


def _dict_to_insert_ignore(
    payload: dict[str, object],
    cfg: DomainConfig,
) -> tuple[dict[str, object], str]:
    _, params, _ = _dict_to_upsert(payload, cfg)
    columns = [*list(cfg["typed"]), "extra"]
    column_sql = ", ".join(columns)
    placeholders = ", ".join(f"%({column})s" for column in columns)
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        message = f"unknown table: {table}"
        raise RuntimeError(message)
    sql = (
        f"INSERT INTO {table}({column_sql}) VALUES ({placeholders}) "  # noqa: S608
        "ON CONFLICT DO NOTHING"
    )
    return params, sql


def _seed_typed_tables(conn: Any) -> None:  # noqa: ANN401
    seed = load_seed_file()
    seed_mapping = (("characters", "characters"), ("items", "items"), ("map", "mapLocations"))
    for kind, seed_key in seed_mapping:
        cfg = _DOMAIN[kind]
        table = cfg["table"]
        if conn.execute(f"SELECT COUNT(*) AS count FROM {table}").fetchone()["count"] > 0:  # noqa: S608
            continue
        for row in seed.get(seed_key, []):
            _, params, sql = _dict_to_upsert(row, cfg)
            conn.execute(sql, params)


def _insert_missing_seed_items(conn: Any) -> None:  # noqa: ANN401
    seed = load_seed_file()
    cfg = _DOMAIN["items"]
    table = cfg["table"]
    for row in seed.get("items", []):
        code = str(row.get("code") or "").strip()
        if not code:
            continue
        exists = conn.execute(
            f"SELECT 1 FROM {table} WHERE code = %s LIMIT 1",  # noqa: S608
            (code,),
        ).fetchone()
        if not exists:
            params, sql = _dict_to_insert_ignore(row, cfg)
            conn.execute(sql, params)


def init_db() -> None:
    """Upgrade the PostgreSQL schema and seed an empty deployment."""
    if not using_postgres():
        message = "LIMIAR_DATABASE_URL is required and must point to PostgreSQL"
        raise RuntimeError(message)
    from alembic import command
    from alembic.config import Config

    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    with db() as conn:
        _seed_typed_tables(conn)
        _insert_missing_seed_items(conn)
        user = conn.execute(
            "SELECT username FROM users WHERE username = %s",
            (DEFAULT_GM_USER,),
        ).fetchone()
        if user is None:
            conn.execute(
                "INSERT INTO users(username, password_hash, role) VALUES (%s, %s, 'admin')",
                (DEFAULT_GM_USER, password_hash(DEFAULT_GM_PASSWORD)),
            )
        else:
            conn.execute(
                "UPDATE users SET role = 'admin' WHERE username = %s AND role = 'gm'",
                (DEFAULT_GM_USER,),
            )
