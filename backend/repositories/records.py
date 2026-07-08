"""Persistence for typed domain records (characters/items/map/assets), key/value
settings, and static reference files."""

import json

from ..config import REFERENCE_DIR
from ..db import _ALLOWED_TABLES, _DOMAIN, _dict_to_upsert, _row_to_dict, db
from ..domain.validation import sanitize_payload


def list_records(kind: str) -> list[dict[str, object]]:
    cfg = _DOMAIN[kind]
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        msg = f"unknown table: {table}"
        raise RuntimeError(msg)
    with db() as conn:
        rows = conn.execute(f"SELECT * FROM {table} ORDER BY id").fetchall()  # noqa: S608
    return [_row_to_dict(row, cfg["typed"]) for row in rows]


def get_record(kind: str, record_id: str) -> dict[str, object] | None:
    cfg = _DOMAIN[kind]
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        msg = f"unknown table: {table}"
        raise RuntimeError(msg)
    with db() as conn:
        row = conn.execute(f"SELECT * FROM {table} WHERE id = ?", (record_id,)).fetchone()  # noqa: S608
    return _row_to_dict(row, cfg["typed"]) if row else None


def upsert_record(kind: str, payload: dict[str, object]) -> dict[str, object]:
    payload = sanitize_payload(dict(payload or {}))
    cfg = _DOMAIN[kind]
    record_id, params, sql = _dict_to_upsert(payload, cfg)
    with db() as conn:
        conn.execute(sql, params)
    payload["id"] = record_id
    return payload


def delete_record(kind: str, record_id: str) -> bool:
    cfg = _DOMAIN[kind]
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        msg = f"unknown table: {table}"
        raise RuntimeError(msg)
    with db() as conn:
        if kind == "items":
            cur = conn.execute(
                f"DELETE FROM {table} WHERE id = ? OR code = ?",  # noqa: S608
                (record_id, record_id),
            )
        else:
            cur = conn.execute(f"DELETE FROM {table} WHERE id = ?", (record_id,))  # noqa: S608
    return cur.rowcount > 0


def get_setting(key: str) -> object:
    with db() as conn:
        row = conn.execute("SELECT data FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["data"]) if row and row["data"] else None


def set_setting(key: str, payload: object) -> object:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False)
    with db() as conn:
        conn.execute(
            """
            INSERT INTO settings(key, data) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
            """,
            (key, data),
        )
    return payload


def get_reference(name: str) -> object:
    """Serve a static reference JSON file from data/seed/<name>.json."""
    path = REFERENCE_DIR / f"{name}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
