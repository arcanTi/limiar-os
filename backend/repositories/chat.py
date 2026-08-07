"""Persistence for the shared comms log (chat_messages table)."""

import json
import secrets

from ..config import CHAT_LIMIT
from ..db import db
from ..domain.validation import sanitize_payload, sanitize_text


def list_chat(campaign_id: str) -> list[dict[str, object]]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM chat_messages WHERE campaign_id = %s ORDER BY created_at, id",
            (campaign_id,),
        ).fetchall()
    result: list[dict[str, object]] = []
    for row in rows:
        raw_extra = row["extra"] or {}
        extra: dict[str, object] = raw_extra if isinstance(raw_extra, dict) else json.loads(raw_extra)
        msg: dict[str, object] = {
            "id": row["id"],
            "campaignId": row["campaign_id"],
            "kind": row["kind"],
            "role": row["role"],
            "sender": row["sender"],
            "text": row["text"],
            "at": row["at"],
            "targetId": row["targetid"],
        }
        if extra.get("roll"):
            msg["roll"] = extra["roll"]
        if extra.get("request"):
            msg["request"] = extra["request"]
        result.append(msg)
    return result


def append_chat(campaign_id: str, message: dict[str, object], role: str) -> dict[str, object]:
    kind_raw = message.get("kind")
    kind: str = kind_raw if kind_raw in ("text", "roll", "request") else "text"
    msg_id = secrets.token_hex(8)
    db_role = "gm" if role == "gm" else "player"
    sender = sanitize_text(
        str(message.get("sender") or ("MESTRE" if role == "gm" else "OPERATIVO")), 60
    )
    text = sanitize_text(str(message.get("text") or ""), 1000)
    at = sanitize_text(str(message.get("at") or ""), 40)
    target_id = message.get("targetId") or None
    extra: dict[str, object] = {
        k: sanitize_payload(message[k])
        for k in ("roll", "request")
        if isinstance(message.get(k), dict)
    }
    entry: dict[str, object] = {
        "id": msg_id,
        "campaignId": campaign_id,
        "role": db_role,
        "sender": sender,
        "kind": kind,
        "text": text,
        "roll": extra.get("roll"),
        "request": extra.get("request"),
        "targetId": target_id,
        "at": at,
    }
    with db() as conn:
        conn.execute(
            "INSERT INTO chat_messages(id, campaign_id, kind, role, sender, text, at, targetId, extra)"
            " VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                msg_id,
                campaign_id,
                kind,
                db_role,
                sender,
                text,
                at,
                target_id,
                json.dumps(extra, ensure_ascii=False),
            ),
        )
        excess = conn.execute(
            "SELECT COUNT(*) AS count FROM chat_messages WHERE campaign_id = %s",
            (campaign_id,),
        ).fetchone()["count"] - CHAT_LIMIT
        if excess > 0:
            conn.execute(
                "DELETE FROM chat_messages WHERE id IN ("
                "SELECT id FROM chat_messages WHERE campaign_id = %s "
                "ORDER BY created_at ASC, id ASC LIMIT %s)",
                (campaign_id, excess),
            )
    return entry


def clear_chat(campaign_id: str) -> None:
    with db() as conn:
        conn.execute("DELETE FROM chat_messages WHERE campaign_id = %s", (campaign_id,))
