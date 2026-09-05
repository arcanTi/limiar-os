"""Persistence for typed domain records (characters/items/map/assets), key/value
settings, and static reference files."""

import json

from ..application.errors import ApplicationError
from ..config import REFERENCE_DIR
from ..db import _ALLOWED_TABLES, _DOMAIN, _dict_to_upsert, _row_to_dict, db
from ..domain.validation import sanitize_payload


def list_records(kind: str, campaign_id: str | None = None) -> list[dict[str, object]]:
    """List one kind, optionally restricted to a campaign.

    `campaign_id=""` selects the rows that belong to no campaign — the seeded
    demo sheets and anything created before a table was picked — which is what
    the desktop shows when the user continues without a campaign. Passing
    ``None`` skips the filter entirely and is only for kinds that are not
    campaign-bound.
    """
    cfg = _DOMAIN[kind]
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        msg = f"unknown table: {table}"
        raise RuntimeError(msg)
    if campaign_id is None:
        sql, params = f"SELECT * FROM {table} ORDER BY id", ()  # noqa: S608
    elif campaign_id:
        sql = f"SELECT * FROM {table} WHERE campaignid = %s ORDER BY id"  # noqa: S608
        params = (campaign_id,)
    else:
        # Rows written before campaignid was normalized carry '' rather than
        # NULL for the campaign-less scope; both mean the same thing here.
        sql = f"SELECT * FROM {table} WHERE campaignid IS NULL OR campaignid = '' ORDER BY id"  # noqa: S608
        params = ()
    with db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_row_to_dict(row, cfg["typed"]) for row in rows]


def get_record(kind: str, record_id: str) -> dict[str, object] | None:
    cfg = _DOMAIN[kind]
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        msg = f"unknown table: {table}"
        raise RuntimeError(msg)
    with db() as conn:
        row = conn.execute(f"SELECT * FROM {table} WHERE id = %s", (record_id,)).fetchone()  # noqa: S608
    return _row_to_dict(row, cfg["typed"]) if row else None


def upsert_record(kind: str, payload: dict[str, object]) -> dict[str, object]:
    payload = sanitize_payload(dict(payload or {}))
    cfg = _DOMAIN[kind]
    record_id, params, sql = _dict_to_upsert(payload, cfg)
    with db() as conn:
        conn.execute(sql, params)
    payload["id"] = record_id
    return payload


def upsert_revisioned_record(
    kind: str,
    payload: dict[str, object],
    expected_revision: int | None,
) -> dict[str, object]:
    """Atomically save a record only when its revision still matches."""
    if kind != "characters":
        msg = f"revisioned writes are not supported for {kind}"
        raise RuntimeError(msg)
    payload = sanitize_payload(dict(payload or {}))
    cfg = _DOMAIN[kind]
    record_id, params, _ = _dict_to_upsert(payload, cfg)
    table = cfg["table"]
    typed = cfg["typed"]
    columns = [*typed, "extra"]
    column_sql = ", ".join(columns)
    placeholders = ", ".join(f"%({column})s" for column in columns)
    updates = ", ".join(f"{column} = %({column})s" for column in columns if column != "id")

    with db() as conn:
        current = conn.execute(
            f"SELECT revision FROM {table} WHERE id = %s",  # noqa: S608
            (record_id,),
        ).fetchone()
        if current is None:
            if expected_revision not in {None, 0}:
                _raise_revision_conflict("character", record_id, expected_revision, None)
            row = conn.execute(
                f"INSERT INTO {table}({column_sql}) VALUES ({placeholders}) "  # noqa: S608
                "ON CONFLICT(id) DO NOTHING RETURNING *",
                params,
            ).fetchone()
            if row is None:
                raced = conn.execute(
                    f"SELECT revision FROM {table} WHERE id = %s",  # noqa: S608
                    (record_id,),
                ).fetchone()
                _raise_revision_conflict(
                    "character",
                    record_id,
                    expected_revision,
                    int(raced["revision"]) if raced else None,
                )
        else:
            current_revision = int(current["revision"])
            if expected_revision is None:
                raise ApplicationError(
                    400,
                    "expectedRevision is required when updating a character",
                    "EXPECTED_REVISION_REQUIRED",
                )
            row = conn.execute(
                f"UPDATE {table} SET {updates}, revision = revision + 1, "  # noqa: S608
                "updated_at = CURRENT_TIMESTAMP WHERE id = %(id)s "
                "AND revision = %(expected_revision)s "
                "RETURNING *",
                {**params, "expected_revision": expected_revision},
            ).fetchone()
            if row is None:
                latest = conn.execute(
                    f"SELECT revision FROM {table} WHERE id = %s",  # noqa: S608
                    (record_id,),
                ).fetchone()
                _raise_revision_conflict(
                    "character",
                    record_id,
                    expected_revision,
                    int(latest["revision"]) if latest else current_revision,
                )

    return _row_to_dict(row, cfg["typed"])


def delete_record(kind: str, record_id: str) -> bool:
    cfg = _DOMAIN[kind]
    table = cfg["table"]
    if table not in _ALLOWED_TABLES:
        msg = f"unknown table: {table}"
        raise RuntimeError(msg)
    with db() as conn:
        if kind == "items":
            cur = conn.execute(
                f"DELETE FROM {table} WHERE id = %s OR code = %s",  # noqa: S608
                (record_id, record_id),
            )
        else:
            cur = conn.execute(f"DELETE FROM {table} WHERE id = %s", (record_id,))  # noqa: S608
    return cur.rowcount > 0


def get_setting(key: str) -> object:
    with db() as conn:
        row = conn.execute("SELECT data FROM settings WHERE key = %s", (key,)).fetchone()
    if not row or row["data"] is None:
        return None
    return row["data"] if isinstance(row["data"], dict | list) else json.loads(row["data"])


def set_setting(key: str, payload: object) -> object:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False)
    with db() as conn:
        conn.execute(
            """
            INSERT INTO settings(key, data) VALUES (%s, %s)
            ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP
            """,
            (key, data),
        )
    return payload


def get_campaign_setting(campaign_id: str, key: str) -> object:
    with db() as conn:
        row = conn.execute(
            "SELECT data, revision FROM campaign_settings WHERE campaign_id = %s AND key = %s",
            (campaign_id, key),
        ).fetchone()
    if not row or row["data"] is None:
        return None
    payload = row["data"] if isinstance(row["data"], dict | list) else json.loads(row["data"])
    if isinstance(payload, dict):
        return {**payload, "revision": int(row["revision"])}
    return payload


def set_campaign_setting(
    campaign_id: str,
    key: str,
    payload: object,
    expected_revision: int | None = None,
) -> object:
    data = None if payload is None else json.dumps(payload, ensure_ascii=False)
    with db() as conn:
        if expected_revision is None:
            row = conn.execute(
                """
                INSERT INTO campaign_settings(campaign_id, key, data) VALUES (%s, %s, %s)
                ON CONFLICT(campaign_id, key) DO UPDATE
                SET data = excluded.data, updated_at = CURRENT_TIMESTAMP,
                    revision = campaign_settings.revision + 1
                RETURNING data, revision
                """,
                (campaign_id, key, data),
            ).fetchone()
        else:
            row = conn.execute(
                """
                INSERT INTO campaign_settings(campaign_id, key, data) VALUES (%s, %s, %s)
                ON CONFLICT(campaign_id, key) DO NOTHING
                RETURNING data, revision
                """,
                (campaign_id, key, data),
            ).fetchone()
            if row is None:
                row = conn.execute(
                    """
                    UPDATE campaign_settings
                    SET data = %s, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
                    WHERE campaign_id = %s AND key = %s AND revision = %s
                    RETURNING data, revision
                    """,
                    (data, campaign_id, key, expected_revision),
                ).fetchone()
            if row is None:
                current = conn.execute(
                    "SELECT revision FROM campaign_settings WHERE campaign_id = %s AND key = %s",
                    (campaign_id, key),
                ).fetchone()
                _raise_revision_conflict(
                    "campaign-setting",
                    f"{campaign_id}:{key}",
                    expected_revision,
                    int(current["revision"]) if current else None,
                )

    if row["data"] is None:
        return None
    saved = row["data"] if isinstance(row["data"], dict | list) else json.loads(row["data"])
    if isinstance(saved, dict):
        return {**saved, "revision": int(row["revision"])}
    return saved


def _raise_revision_conflict(
    resource: str,
    resource_id: str,
    expected_revision: int | None,
    current_revision: int | None,
) -> None:
    raise ApplicationError(
        409,
        "This record was changed by another user. Reload and try again.",
        "REVISION_CONFLICT",
        {
            "resource": resource,
            "id": resource_id,
            "expectedRevision": expected_revision,
            "currentRevision": current_revision,
        },
    )


def get_reference(name: str) -> object:
    """Serve a static reference JSON file from data/seed/<name>.json."""
    path = REFERENCE_DIR / f"{name}.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
