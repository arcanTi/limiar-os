"""Scope shared table state and chat messages to their campaign.

Revision ID: 0004
Revises: 0003
"""

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS campaign_id TEXT")
    op.execute("""
        UPDATE chat_messages
        SET campaign_id = (
          SELECT id FROM campaigns ORDER BY created_at, id LIMIT 1
        )
        WHERE campaign_id IS NULL
    """)
    op.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'chat_messages_campaign_id_fkey'
          ) THEN
            ALTER TABLE chat_messages
              ADD CONSTRAINT chat_messages_campaign_id_fkey
              FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM chat_messages WHERE campaign_id IS NULL) THEN
            ALTER TABLE chat_messages ALTER COLUMN campaign_id SET NOT NULL;
          END IF;
        END $$;
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_chat_messages_campaign_created "
        "ON chat_messages(campaign_id, created_at, id)"
    )
    op.execute("""
        CREATE TABLE IF NOT EXISTS campaign_settings (
          campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          data JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (campaign_id, key)
        )
    """)
    op.execute("""
        INSERT INTO campaign_settings(campaign_id, key, data)
        SELECT campaign.id, settings.key, settings.data
        FROM settings
        CROSS JOIN LATERAL (
          SELECT id FROM campaigns ORDER BY created_at, id LIMIT 1
        ) AS campaign
        WHERE settings.key IN (
          'combat-state', 'tarot-state', 'hqIp', 'nexusChallenge', 'nexusResult'
        )
        ON CONFLICT(campaign_id, key) DO NOTHING
    """)
    op.execute("ALTER TABLE campaign_events DROP CONSTRAINT IF EXISTS campaign_events_topic_check")
    op.execute("""
        ALTER TABLE campaign_events ADD CONSTRAINT campaign_events_topic_check
        CHECK (topic IN ('map', 'chat', 'combat', 'roster', 'tarot', 'hq', 'nexus'))
    """)
    op.execute("DROP TRIGGER IF EXISTS chat_messages_event ON chat_messages")
    op.execute("""
        CREATE OR REPLACE FUNCTION chat_campaign_event_trigger()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          IF COALESCE(NEW.campaign_id, OLD.campaign_id) IS NOT NULL THEN
            PERFORM emit_campaign_event(COALESCE(NEW.campaign_id, OLD.campaign_id), 'chat');
          END IF;
          RETURN COALESCE(NEW, OLD);
        END $$
    """)
    op.execute("""
        CREATE TRIGGER chat_messages_campaign_event
        AFTER INSERT OR UPDATE OR DELETE ON chat_messages
        FOR EACH ROW EXECUTE FUNCTION chat_campaign_event_trigger()
    """)
    op.execute("""
        CREATE OR REPLACE FUNCTION campaign_settings_event_trigger()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        DECLARE event_topic TEXT;
        BEGIN
          event_topic := CASE COALESCE(NEW.key, OLD.key)
            WHEN 'combat-state' THEN 'combat'
            WHEN 'tarot-state' THEN 'tarot'
            WHEN 'hqIp' THEN 'hq'
            WHEN 'nexusChallenge' THEN 'nexus'
            WHEN 'nexusResult' THEN 'nexus'
            ELSE NULL
          END;
          IF event_topic IS NOT NULL THEN
            PERFORM emit_campaign_event(COALESCE(NEW.campaign_id, OLD.campaign_id), event_topic);
          END IF;
          RETURN COALESCE(NEW, OLD);
        END $$
    """)
    op.execute("""
        CREATE TRIGGER campaign_settings_event
        AFTER INSERT OR UPDATE OR DELETE ON campaign_settings
        FOR EACH ROW EXECUTE FUNCTION campaign_settings_event_trigger()
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS campaign_settings CASCADE")
    op.execute("DROP FUNCTION IF EXISTS campaign_settings_event_trigger() CASCADE")
    op.execute("DROP FUNCTION IF EXISTS chat_campaign_event_trigger() CASCADE")
    op.execute("DROP INDEX IF EXISTS idx_chat_messages_campaign_created")
    op.execute("ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_campaign_id_fkey")
    op.execute("ALTER TABLE chat_messages DROP COLUMN IF EXISTS campaign_id")
    op.execute("ALTER TABLE campaign_events DROP CONSTRAINT IF EXISTS campaign_events_topic_check")
    op.execute("""
        ALTER TABLE campaign_events ADD CONSTRAINT campaign_events_topic_check
        CHECK (topic IN ('map', 'chat', 'combat', 'roster'))
    """)
