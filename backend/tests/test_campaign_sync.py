import pytest
from conftest import seed_fixture_campaigns, seed_session_users

from backend.repositories import campaign_sync


@pytest.fixture(autouse=True)
def _fk_parents(db_path):
    """Create the parent rows required by PostgreSQL foreign keys."""
    seed_session_users()
    seed_fixture_campaigns()


def test_bump_campaign_reports_only_touched_topic():
    campaign_id = "sync-camp-bump-1"
    baseline = campaign_sync.current_version(campaign_id)
    before = campaign_sync.wait_for_campaign_update(campaign_id, baseline, timeout=0.05)
    assert before == {"version": baseline, "changed": False, "topics": []}

    version = campaign_sync.bump_campaign(campaign_id, "map")
    result = campaign_sync.wait_for_campaign_update(campaign_id, before["version"], timeout=0.05)
    assert result == {"version": version, "changed": True, "topics": ["map"]}


def test_bump_all_touches_every_persisted_campaign():
    watched = "sync-camp-bump-1"
    unwatched = "sync-camp-multi"
    watched_before = campaign_sync.current_version(watched)
    unwatched_before = campaign_sync.current_version(unwatched)

    campaign_sync.bump_all("chat")

    watched_result = campaign_sync.wait_for_campaign_update(watched, watched_before, timeout=0.05)
    assert watched_result["changed"] is True
    assert watched_result["topics"] == ["chat"]
    assert campaign_sync.current_version(unwatched) > unwatched_before


def test_multiple_topics_between_polls_are_all_reported():
    campaign_id = "sync-camp-multi"
    since = campaign_sync.current_version(campaign_id)

    campaign_sync.bump_campaign(campaign_id, "map")
    campaign_sync.bump_all("chat")
    campaign_sync.bump_all("combat")

    result = campaign_sync.wait_for_campaign_update(campaign_id, since, timeout=0.05)
    assert result["changed"] is True
    assert result["topics"] == ["chat", "combat", "map"]


def test_stale_since_past_the_log_buffer_reports_every_topic():
    campaign_id = "sync-camp-stale"
    baseline = campaign_sync.current_version(campaign_id)
    for _ in range(campaign_sync._LOG_LIMIT + 5):
        campaign_sync.bump_campaign(campaign_id, "map")

    result = campaign_sync.wait_for_campaign_update(campaign_id, baseline, timeout=0.05)
    assert result["changed"] is True
    assert result["topics"] == list(campaign_sync.TOPICS)
