"""Transactional, cross-process campaign event log.

Revision ID: 0003
Revises: 0002
"""
# ruff: noqa: E501

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

MAP_TABLES = (
    "campaign_map_scenes",
    "campaign_map_tokens",
    "campaign_map_fog",
    "campaign_map_reveals",
    "campaign_map_reveals_personal",
    "campaign_map_templates",
    "campaign_map_props",
    "campaign_map_pings",
    "campaign_map_walls",
    "campaign_map_lights",
    "campaign_map_drawings",
    "campaign_map_pins",
)


def upgrade() -> None:
    op.execute("""
        CREATE TABLE campaign_event_versions (
          campaign_id TEXT PRIMARY KEY,
          version BIGINT NOT NULL DEFAULT 0
        )
    """)
    op.execute("""
        CREATE TABLE campaign_events (
          id BIGSERIAL PRIMARY KEY,
          campaign_id TEXT NOT NULL,
          version BIGINT NOT NULL,
          topic TEXT NOT NULL CHECK (topic IN ('map', 'chat', 'combat', 'roster')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (campaign_id, version)
        )
    """)
    op.execute(
        "CREATE INDEX campaign_events_campaign_version ON campaign_events(campaign_id, version)"
    )
    op.execute("""
        CREATE OR REPLACE FUNCTION emit_campaign_event(target_campaign TEXT, event_topic TEXT)
        RETURNS BIGINT LANGUAGE plpgsql AS $$
        DECLARE next_version BIGINT;
        BEGIN
          INSERT INTO campaign_event_versions(campaign_id, version)
          VALUES (target_campaign, 1)
          ON CONFLICT(campaign_id) DO UPDATE
            SET version = campaign_event_versions.version + 1
          RETURNING version INTO next_version;
          INSERT INTO campaign_events(campaign_id, version, topic)
          VALUES (target_campaign, next_version, event_topic);
          DELETE FROM campaign_events
          WHERE campaign_id = target_campaign AND version <= next_version - 200;
          PERFORM pg_notify(
            'limiar_campaign_events',
            json_build_object('campaignId', target_campaign, 'version', next_version, 'topic', event_topic)::text
          );
          RETURN next_version;
        END $$
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION emit_global_event(event_topic TEXT)
        RETURNS VOID LANGUAGE plpgsql AS $$
        DECLARE campaign_row RECORD;
        BEGIN
          FOR campaign_row IN SELECT id FROM campaigns LOOP
            PERFORM emit_campaign_event(campaign_row.id, event_topic);
          END LOOP;
        END $$
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION campaign_map_event_trigger()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM emit_campaign_event(COALESCE(NEW.campaign_id, OLD.campaign_id), 'map');
          RETURN COALESCE(NEW, OLD);
        END $$
    """)
    for table in MAP_TABLES:
        op.execute(
            f"CREATE TRIGGER {table}_event AFTER INSERT OR UPDATE OR DELETE ON {table} "
            "FOR EACH ROW EXECUTE FUNCTION campaign_map_event_trigger()"
        )
    op.execute("""
        CREATE OR REPLACE FUNCTION global_topic_event_trigger()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          PERFORM emit_global_event(TG_ARGV[0]);
          RETURN NULL;
        END $$
    """)
    for table, topic in (
        ("characters", "roster"),
        ("campaigns", "roster"),
        ("campaign_members", "roster"),
        ("campaign_invites", "roster"),
        ("chat_messages", "chat"),
    ):
        op.execute(
            f"CREATE TRIGGER {table}_event AFTER INSERT OR UPDATE OR DELETE ON {table} "
            f"FOR EACH STATEMENT EXECUTE FUNCTION global_topic_event_trigger('{topic}')"
        )
    op.execute("""
        CREATE OR REPLACE FUNCTION settings_event_trigger()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          IF COALESCE(NEW.key, OLD.key) = 'combat-state' THEN
            PERFORM emit_global_event('combat');
          END IF;
          RETURN COALESCE(NEW, OLD);
        END $$
    """)
    op.execute(
        "CREATE TRIGGER settings_event AFTER INSERT OR UPDATE OR DELETE ON settings "
        "FOR EACH ROW EXECUTE FUNCTION settings_event_trigger()"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS campaign_events CASCADE")
    op.execute("DROP TABLE IF EXISTS campaign_event_versions CASCADE")
    op.execute("DROP FUNCTION IF EXISTS settings_event_trigger() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS global_topic_event_trigger() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS campaign_map_event_trigger() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS emit_global_event(TEXT) CASCADE")
    op.execute("DROP FUNCTION IF EXISTS emit_campaign_event(TEXT, TEXT) CASCADE")
