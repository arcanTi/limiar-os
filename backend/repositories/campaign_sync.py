"""PostgreSQL-backed campaign event stream shared by every app instance."""

import threading
import time
from collections.abc import Callable

from ..db import db

TOPICS = ("map", "chat", "combat", "roster")
_LOG_LIMIT = 200
_POLL_SECONDS = 0.1

_listeners: set[Callable[[dict[str, object]], None]] = set()
_listeners_lock = threading.Lock()
_listener_thread: threading.Thread | None = None
_listener_stop = threading.Event()


def bump_campaign(campaign_id: str, topic: str) -> int:
    if topic not in TOPICS:
        message = f"unknown campaign event topic: {topic}"
        raise ValueError(message)
    with db() as conn:
        row = conn.execute(
            "SELECT emit_campaign_event(%s, %s) AS version",
            (campaign_id, topic),
        ).fetchone()
    return int(row["version"])


def bump_all(topic: str) -> None:
    if topic not in TOPICS:
        message = f"unknown campaign event topic: {topic}"
        raise ValueError(message)
    with db() as conn:
        conn.execute("SELECT emit_global_event(%s)", (topic,))


def current_version(campaign_id: str) -> int:
    with db() as conn:
        row = conn.execute(
            "SELECT version FROM campaign_event_versions WHERE campaign_id = %s",
            (campaign_id,),
        ).fetchone()
    return int(row["version"]) if row else 0


def snapshot_since(campaign_id: str, since: int) -> dict[str, object]:
    with db() as conn:
        version_row = conn.execute(
            "SELECT version FROM campaign_event_versions WHERE campaign_id = %s",
            (campaign_id,),
        ).fetchone()
        version = int(version_row["version"]) if version_row else 0
        if version == since:
            return {"version": version, "changed": False, "topics": []}
        bounds = conn.execute(
            "SELECT MIN(version) AS oldest FROM campaign_events WHERE campaign_id = %s",
            (campaign_id,),
        ).fetchone()
        oldest = int(bounds["oldest"]) if bounds and bounds["oldest"] is not None else version
        if since != 0 and since < oldest - 1:
            topics = list(TOPICS)
        else:
            rows = conn.execute(
                "SELECT DISTINCT topic FROM campaign_events "
                "WHERE campaign_id = %s AND version > %s ORDER BY topic",
                (campaign_id, since),
            ).fetchall()
            topics = [str(row["topic"]) for row in rows]
    return {"version": version, "changed": True, "topics": topics}


def wait_for_campaign_update(
    campaign_id: str, since: int, timeout: float = 25.0
) -> dict[str, object]:
    deadline = time.monotonic() + max(0.0, min(float(timeout), 25.0))
    while True:
        snapshot = snapshot_since(campaign_id, since)
        if snapshot["changed"] or time.monotonic() >= deadline:
            return snapshot
        time.sleep(min(_POLL_SECONDS, max(0.0, deadline - time.monotonic())))


def _event_cursor() -> int:
    with db() as conn:
        row = conn.execute("SELECT COALESCE(MAX(id), 0) AS id FROM campaign_events").fetchone()
    return int(row["id"])


def _listen_loop() -> None:
    cursor = _event_cursor()
    while not _listener_stop.wait(_POLL_SECONDS):
        with _listeners_lock:
            if not _listeners:
                return
            listeners = tuple(_listeners)
        with db() as conn:
            rows = conn.execute(
                "SELECT id, campaign_id, version, topic FROM campaign_events "
                "WHERE id > %s ORDER BY id LIMIT 500",
                (cursor,),
            ).fetchall()
        for row in rows:
            cursor = max(cursor, int(row["id"]))
            event = {
                "campaignId": row["campaign_id"],
                "version": int(row["version"]),
                "topic": row["topic"],
            }
            for listener in listeners:
                listener(event)


def subscribe(listener: Callable[[dict[str, object]], None]) -> Callable[[], None]:
    global _listener_thread
    with _listeners_lock:
        _listeners.add(listener)
        if _listener_thread is None or not _listener_thread.is_alive():
            _listener_stop.clear()
            _listener_thread = threading.Thread(
                target=_listen_loop, name="limiar-campaign-events", daemon=True
            )
            _listener_thread.start()

    def unsubscribe() -> None:
        with _listeners_lock:
            _listeners.discard(listener)
            if not _listeners:
                _listener_stop.set()

    return unsubscribe
