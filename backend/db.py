"""SQLite connection, schema bootstrap, migrations, seeding, and the typed-table
domain mapping shared by the repositories."""

import json
import logging
import secrets
import sqlite3
from typing import TypedDict, cast

from .config import (
    DATA_DIR,
    DB_PATH,
    DEFAULT_GM_PASSWORD,
    DEFAULT_GM_USER,
    SEED_PATH,
    SESSION_TTL_SECONDS,
    UPLOAD_DIR,
)
from .security import password_hash
from .util import slug


def db() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


EMPTY_SEED: dict[str, list[dict[str, object]]] = {
    "characters": [],
    "items": [],
    "mapLocations": [],
    "gear": [],
}


def load_seed_file() -> dict[str, list[dict[str, object]]]:
    """Load the declarative seed from data/seed/limiar-seed.json.

    This JSON is now the source of truth for character/item/map seed data.
    Edit the JSON directly to change what the database is seeded with on first boot.
    """
    try:
        payload = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        logging.warning("[limiar] seed file missing: %s", SEED_PATH)
        return dict(EMPTY_SEED)
    except (json.JSONDecodeError, OSError):
        logging.exception("[limiar] seed load failed")
        return dict(EMPTY_SEED)
    return {key: payload.get(key) or [] for key in EMPTY_SEED}


# --- Domain table configuration ---
# typed: columns promoted out of the JSON blob for querying/filtering.
# Everything else in the payload lands in `extra` (JSON).


class DomainConfig(TypedDict):
    """Schema for a single entry in _DOMAIN."""

    table: str
    typed: tuple[str, ...]


_DOMAIN: dict[str, DomainConfig] = {
    "characters": {"table": "characters", "typed": ("id", "name", "role", "level")},
    "items": {"table": "items", "typed": ("id", "code", "name", "cat", "price", "stock")},
    "map": {"table": "map_locations", "typed": ("id", "name", "threat")},
    "assets": {"table": "assets", "typed": ("id", "name", "scope", "ownerId", "type", "url")},
}

# Allowlist used to guard every f-string table name before it reaches SQLite.
_ALLOWED_TABLES: frozenset[str] = frozenset(cfg["table"] for cfg in _DOMAIN.values())


def _row_to_dict(row: sqlite3.Row, typed_cols: tuple[str, ...]) -> dict[str, object]:
    """Reconstruct full payload dict from a typed-table row."""
    d = {col: row[col] for col in typed_cols if row[col] is not None}
    d.setdefault("id", row["id"])
    extra_data: dict[str, object] = json.loads(row["extra"] or "{}")
    return {**d, **extra_data}


def _dict_to_upsert(
    payload: dict[str, object], cfg: DomainConfig
) -> tuple[str, dict[str, object], str]:
    """Return (record_id, params, sql) for an upsert into a typed domain table."""
    typed = cfg["typed"]
    record_id = str(payload.get("id") or payload.get("code") or slug(payload.get("name")))
    params: dict[str, object] = {"id": record_id}
    for col in typed:
        if col != "id":
            params[col] = payload.get(col)
    params["extra"] = json.dumps(
        {k: v for k, v in payload.items() if k not in set(typed)},
        ensure_ascii=False,
    )
    col_list = [*list(typed), "extra"]
    col_str = ", ".join(col_list)
    placeholders = ", ".join(f":{c}" for c in col_list)
    updates = ", ".join(f"{c}=excluded.{c}" for c in col_list if c != "id")
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        msg = f"unknown table: {table}"
        raise RuntimeError(msg)
    sql = (
        f"INSERT INTO {table}({col_str}) VALUES ({placeholders})"  # noqa: S608
        f" ON CONFLICT(id) DO UPDATE SET {updates}, updated_at=CURRENT_TIMESTAMP"
    )
    return record_id, params, sql


def _dict_to_insert_ignore(
    payload: dict[str, object], cfg: DomainConfig
) -> tuple[dict[str, object], str]:
    """Return params/sql for a non-destructive typed-table insert."""
    _, params, _ = _dict_to_upsert(payload, cfg)
    col_list = [*list(cfg["typed"]), "extra"]
    col_str = ", ".join(col_list)
    placeholders = ", ".join(f":{c}" for c in col_list)
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        msg = f"unknown table: {table}"
        raise RuntimeError(msg)
    return params, f"INSERT OR IGNORE INTO {table}({col_str}) VALUES ({placeholders})"  # noqa: S608


def _migrate_records_to_typed(conn: sqlite3.Connection) -> None:
    """Copy legacy records rows into typed tables. Skips any table that already has data."""
    for kind, cfg in _DOMAIN.items():
        table = cfg["table"]
        if table not in _ALLOWED_TABLES:
            msg = f"unknown table: {table}"
            raise RuntimeError(msg)
        if conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] > 0:  # noqa: S608
            continue
        for old in conn.execute("SELECT data FROM records WHERE kind = ?", (kind,)):
            _, params, sql = _dict_to_upsert(json.loads(old["data"]), cfg)
            conn.execute(sql, params)
    # Migrate chat from settings JSON blob to chat_messages table.
    if conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0] == 0:
        row = conn.execute("SELECT data FROM settings WHERE key = 'chat'").fetchone()
        if row and row["data"]:
            raw_chat: list[object] = json.loads(row["data"] or "[]")
            for item in raw_chat:
                if not isinstance(item, dict):
                    continue
                msg = cast("dict[str, object]", item)
                extra: dict[str, object] = {
                    k: msg[k] for k in ("roll", "request") if isinstance(msg.get(k), dict)
                }
                conn.execute(
                    "INSERT OR IGNORE INTO chat_messages"
                    "(id, kind, role, sender, text, at, targetId, extra) VALUES (?,?,?,?,?,?,?,?)",
                    (
                        str(msg.get("id") or secrets.token_hex(8)),
                        str(msg.get("kind") or "text"),
                        str(msg.get("role") or "player"),
                        msg.get("sender"),
                        msg.get("text"),
                        msg.get("at"),
                        msg.get("targetId"),
                        json.dumps(extra, ensure_ascii=False),
                    ),
                )


def _seed_typed_tables(conn: sqlite3.Connection) -> None:
    """Seed typed tables from JSON if still empty after migration (fresh install)."""
    seed = load_seed_file()
    seed_mapping = (("characters", "characters"), ("items", "items"), ("map", "mapLocations"))
    for kind, seed_key in seed_mapping:
        cfg = _DOMAIN[kind]
        table = cfg["table"]
        if table not in _ALLOWED_TABLES:
            msg = f"unknown table: {table}"
            raise RuntimeError(msg)
        if conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] > 0:  # noqa: S608
            continue
        for row in seed.get(seed_key, []):
            _, params, sql = _dict_to_upsert(row, cfg)
            conn.execute(sql, params)


def _insert_missing_seed_items(conn: sqlite3.Connection) -> None:
    """Add new seed catalog items by code without touching existing item rows."""
    seed = load_seed_file()
    cfg = _DOMAIN["items"]
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        msg = f"unknown table: {table}"
        raise RuntimeError(msg)
    for row in seed.get("items", []):
        code = str(row.get("code") or "").strip()
        if not code:
            continue
        exists = conn.execute(
            f"SELECT 1 FROM {table} WHERE code = ? LIMIT 1",  # noqa: S608
            (code,),
        ).fetchone()
        if exists:
            continue
        params, sql = _dict_to_insert_ignore(row, cfg)
        conn.execute(sql, params)


def init_db() -> None:
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS records (
              kind TEXT NOT NULL,
              id TEXT NOT NULL,
              data TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (kind, id)
            );
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              data TEXT,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS users (
              username TEXT PRIMARY KEY,
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS sessions (
              token TEXT PRIMARY KEY,
              username TEXT NOT NULL,
              role TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(username) REFERENCES users(username)
            );
            CREATE TABLE IF NOT EXISTS characters (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL DEFAULT '',
              role TEXT,
              level INTEGER,
              extra TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS items (
              id TEXT PRIMARY KEY,
              code TEXT,
              name TEXT,
              cat TEXT,
              price INTEGER,
              stock TEXT,
              extra TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS map_locations (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL DEFAULT '',
              threat TEXT,
              extra TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS assets (
              id TEXT PRIMARY KEY,
              name TEXT,
              scope TEXT,
              ownerId TEXT,
              type TEXT,
              url TEXT,
              extra TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS chat_messages (
              id TEXT PRIMARY KEY,
              kind TEXT NOT NULL DEFAULT 'text',
              role TEXT NOT NULL DEFAULT 'player',
              sender TEXT,
              text TEXT,
              at TEXT,
              targetId TEXT,
              extra TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS campaigns (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              description TEXT,
              visibility TEXT NOT NULL DEFAULT 'public',
              status TEXT NOT NULL DEFAULT 'active',
              created_by TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS campaign_members (
              campaign_id TEXT NOT NULL,
              username TEXT NOT NULL,
              character_id TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'player',
              joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (campaign_id, username),
              UNIQUE (campaign_id, character_id),
              FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
              FOREIGN KEY(username) REFERENCES users(username)
            );
            CREATE TABLE IF NOT EXISTS campaign_invites (
              id TEXT PRIMARY KEY,
              campaign_id TEXT NOT NULL,
              username TEXT NOT NULL,
              invited_by TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              responded_at TEXT,
              UNIQUE (campaign_id, username),
              FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
              FOREIGN KEY(username) REFERENCES users(username)
            );
            CREATE TABLE IF NOT EXISTS campaign_map_scenes (
              id TEXT PRIMARY KEY,
              campaign_id TEXT NOT NULL,
              name TEXT NOT NULL,
              background TEXT,
              background_fit TEXT NOT NULL DEFAULT 'contain',
              width INTEGER NOT NULL DEFAULT 1600,
              height INTEGER NOT NULL DEFAULT 1000,
              grid_size INTEGER NOT NULL DEFAULT 64,
              fog_enabled INTEGER NOT NULL DEFAULT 1,
              shadow_opacity REAL NOT NULL DEFAULT 0.92,
              active INTEGER NOT NULL DEFAULT 0,
              difficult_terrain TEXT NOT NULL DEFAULT '[]',
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS campaign_map_tokens (
              id TEXT PRIMARY KEY,
              campaign_id TEXT NOT NULL,
              scene_id TEXT NOT NULL,
              character_id TEXT,
              name TEXT NOT NULL,
              kind TEXT NOT NULL DEFAULT 'npc',
              owner_username TEXT,
              x REAL NOT NULL DEFAULT 120,
              y REAL NOT NULL DEFAULT 120,
              size REAL NOT NULL DEFAULT 1,
              color TEXT NOT NULL DEFAULT '#d6aa4e',
              image TEXT,
              hp INTEGER,
              hp_max INTEGER,
              vision INTEGER NOT NULL DEFAULT 240,
              visible INTEGER NOT NULL DEFAULT 1,
              move REAL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(campaign_id, scene_id, character_id),
              FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
              FOREIGN KEY(scene_id) REFERENCES campaign_map_scenes(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS campaign_map_fog (
              id TEXT PRIMARY KEY,
              campaign_id TEXT NOT NULL,
              scene_id TEXT NOT NULL,
              x REAL NOT NULL,
              y REAL NOT NULL,
              width REAL NOT NULL,
              height REAL NOT NULL,
              label TEXT,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
              FOREIGN KEY(scene_id) REFERENCES campaign_map_scenes(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS campaign_map_reveals (
              id TEXT PRIMARY KEY,
              campaign_id TEXT NOT NULL,
              scene_id TEXT NOT NULL,
              token_id TEXT,
              x REAL NOT NULL,
              y REAL NOT NULL,
              radius REAL NOT NULL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
              FOREIGN KEY(scene_id) REFERENCES campaign_map_scenes(id) ON DELETE CASCADE
            );
            """,
        )

        _migrate_records_to_typed(conn)
        _seed_typed_tables(conn)
        _insert_missing_seed_items(conn)

        # Migration: older databases have a sessions table without expires_at.
        session_cols = {
            row["name"] for row in conn.execute("PRAGMA table_info(sessions)").fetchall()
        }
        if "expires_at" not in session_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN expires_at TEXT")
            conn.execute(
                "UPDATE sessions SET expires_at = datetime('now', ?)",
                (f"+{SESSION_TTL_SECONDS} seconds",),
            )

        # Migration: older databases have an assets table without extra.
        asset_cols = {
            row["name"] for row in conn.execute("PRAGMA table_info(assets)").fetchall()
        }
        if "extra" not in asset_cols:
            conn.execute("ALTER TABLE assets ADD COLUMN extra TEXT NOT NULL DEFAULT '{}'")

        # Migration: older databases predate tactical movement (Fase 4 RAW gaps
        # sequel) — difficult terrain on the scene, manual MOVE on tokens.
        scene_cols = {
            row["name"] for row in conn.execute("PRAGMA table_info(campaign_map_scenes)").fetchall()
        }
        if "difficult_terrain" not in scene_cols:
            conn.execute("ALTER TABLE campaign_map_scenes ADD COLUMN difficult_terrain TEXT NOT NULL DEFAULT '[]'")

        token_cols = {
            row["name"] for row in conn.execute("PRAGMA table_info(campaign_map_tokens)").fetchall()
        }
        if "move" not in token_cols:
            conn.execute("ALTER TABLE campaign_map_tokens ADD COLUMN move REAL")

        user = conn.execute(
            "SELECT username FROM users WHERE username = ?",
            (DEFAULT_GM_USER,),
        ).fetchone()
        if user is None:
            conn.execute(
                "INSERT INTO users(username, password_hash, role) VALUES (?, ?, 'admin')",
                (DEFAULT_GM_USER, password_hash(DEFAULT_GM_PASSWORD)),
            )
        else:
            conn.execute(
                "UPDATE users SET role = 'admin' WHERE username = ? AND role = 'gm'",
                (DEFAULT_GM_USER,),
            )
