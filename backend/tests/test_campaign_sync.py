from backend.repositories import campaign_sync


def test_bump_campaign_reports_only_touched_topic():
    campaign_id = "sync-camp-bump-1"
    before = campaign_sync.wait_for_campaign_update(campaign_id, 0, timeout=0.05)
    assert before == {"version": 0, "changed": False, "topics": []}

    version = campaign_sync.bump_campaign(campaign_id, "map")
    result = campaign_sync.wait_for_campaign_update(campaign_id, before["version"], timeout=0.05)
    assert result == {"version": version, "changed": True, "topics": ["map"]}


def test_bump_all_touches_only_campaigns_already_being_watched():
    watched = "sync-camp-watched"
    unwatched = "sync-camp-unwatched"
    campaign_sync.wait_for_campaign_update(watched, 0, timeout=0.05)  # registers interest

    campaign_sync.bump_all("chat")

    watched_result = campaign_sync.wait_for_campaign_update(watched, 0, timeout=0.05)
    assert watched_result["changed"] is True
    assert watched_result["topics"] == ["chat"]
    # A campaign nobody has polled yet has nothing to catch up on — its
    # first GET fetches full state directly, not through the delta channel.
    assert campaign_sync.current_version(unwatched) == 0


def test_multiple_topics_between_polls_are_all_reported():
    campaign_id = "sync-camp-multi"
    campaign_sync.wait_for_campaign_update(campaign_id, 0, timeout=0.05)  # register
    since = campaign_sync.current_version(campaign_id)

    campaign_sync.bump_campaign(campaign_id, "map")
    campaign_sync.bump_all("chat")
    campaign_sync.bump_all("combat")

    result = campaign_sync.wait_for_campaign_update(campaign_id, since, timeout=0.05)
    assert result["changed"] is True
    assert result["topics"] == ["chat", "combat", "map"]


def test_stale_since_past_the_log_buffer_reports_every_topic():
    campaign_id = "sync-camp-stale"
    campaign_sync.wait_for_campaign_update(campaign_id, 0, timeout=0.05)  # register
    for _ in range(campaign_sync._LOG_LIMIT + 5):
        campaign_sync.bump_campaign(campaign_id, "map")

    result = campaign_sync.wait_for_campaign_update(campaign_id, 1, timeout=0.05)
    assert result["changed"] is True
    assert result["topics"] == list(campaign_sync.TOPICS)
