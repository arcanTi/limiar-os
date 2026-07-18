"""Unified per-campaign update channel: one long-poll version counter per
campaign, tagged with which topics (map/chat/combat/roster) changed since a
given version. Generalizes the map-only long-poll in `campaign_maps.py` so
the whole app (chat, combat tracker, roster) can retire fixed-interval
polling in favor of a single wait-for-change call per campaign.

chat_messages and combat-state are global (single shared table, not
campaign-scoped) so their mutations bump every campaign currently being
watched via `bump_all`; map mutations are already campaign_id-scoped and use
`bump_campaign` directly.
"""

import threading

TOPICS = ("map", "chat", "combat", "roster")

_LOG_LIMIT = 200

_lock = threading.Condition()
_versions: dict[str, int] = {}
_topic_log: dict[str, list[tuple[int, str]]] = {}


def _bump_locked(campaign_id: str, topic: str) -> int:
    version = _versions.get(campaign_id, 0) + 1
    _versions[campaign_id] = version
    log = _topic_log.setdefault(campaign_id, [])
    log.append((version, topic))
    if len(log) > _LOG_LIMIT:
        del log[: len(log) - _LOG_LIMIT]
    return version


def bump_campaign(campaign_id: str, topic: str) -> int:
    with _lock:
        version = _bump_locked(campaign_id, topic)
        _lock.notify_all()
        return version


def bump_all(topic: str) -> None:
    """Bump a global-state topic (chat/combat) for every campaign a client
    has already registered interest in via `wait_for_campaign_update`."""
    with _lock:
        for campaign_id in list(_versions.keys()):
            _bump_locked(campaign_id, topic)
        _lock.notify_all()


def current_version(campaign_id: str) -> int:
    with _lock:
        return _versions.get(campaign_id, 0)


def wait_for_campaign_update(campaign_id: str, since: int, timeout: float = 25.0) -> dict[str, object]:
    with _lock:
        _versions.setdefault(campaign_id, 0)
        if _versions[campaign_id] == since:
            _lock.wait(timeout=max(0.1, min(float(timeout), 25.0)))
        version = _versions.get(campaign_id, 0)
        changed = version != since
        if not changed:
            return {"version": version, "changed": False, "topics": []}
        log = _topic_log.get(campaign_id, [])
        oldest_logged = log[0][0] if log else version
        if since != 0 and since < oldest_logged - 1:
            # Buffer truncated past `since` — can't compute an exact delta,
            # so report every topic dirty rather than silently under-report.
            topics = list(TOPICS)
        else:
            topics = sorted({t for v, t in log if v > since})
        return {"version": version, "changed": True, "topics": topics}
