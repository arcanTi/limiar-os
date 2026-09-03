CREATE TABLE IF NOT EXISTS schema_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version INTEGER NOT NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO schema_meta(id, version) VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS records (
  kind TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  data TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
  username TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_access_token ON users(access_token);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  username TEXT NOT NULL REFERENCES users(username),
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  remember INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  role TEXT,
  level INTEGER,
  campaignid TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_characters_campaignid ON characters(campaignid);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  code TEXT,
  name TEXT,
  cat TEXT,
  price INTEGER,
  stock TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_items_code ON items(code);
CREATE TABLE IF NOT EXISTS map_locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  threat TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT,
  scope TEXT,
  ownerid TEXT,
  type TEXT,
  url TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  role TEXT NOT NULL DEFAULT 'player',
  sender TEXT,
  text TEXT,
  at TEXT,
  targetid TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at, id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_campaign_created ON chat_messages(campaign_id, created_at, id);
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  visibility TEXT NOT NULL DEFAULT 'public',
  status TEXT NOT NULL DEFAULT 'active',
  system TEXT NOT NULL DEFAULT 'cyberpunk-red',
  banner_url TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_settings (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  data JSONB,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, key)
);
CREATE TABLE IF NOT EXISTS campaign_members (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES users(username),
  character_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id, username),
  UNIQUE (campaign_id, character_id)
);
CREATE TABLE IF NOT EXISTS campaign_invites (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES users(username),
  invited_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMPTZ,
  UNIQUE (campaign_id, username)
);
CREATE TABLE IF NOT EXISTS campaign_map_scenes (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  background TEXT,
  background_fit TEXT NOT NULL DEFAULT 'contain',
  width INTEGER NOT NULL DEFAULT 1600,
  height INTEGER NOT NULL DEFAULT 1000,
  grid_size INTEGER NOT NULL DEFAULT 64,
  fog_enabled INTEGER NOT NULL DEFAULT 1,
  shadow_opacity DOUBLE PRECISION NOT NULL DEFAULT 0.92,
  darkness DOUBLE PRECISION NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 0,
  difficult_terrain TEXT NOT NULL DEFAULT '[]',
  exploration_mode TEXT NOT NULL DEFAULT 'shared',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_campaign_map_scenes_campaign
  ON campaign_map_scenes(campaign_id, active);
CREATE TABLE IF NOT EXISTS campaign_map_tokens (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  character_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'npc',
  owner_username TEXT,
  x DOUBLE PRECISION NOT NULL DEFAULT 120,
  y DOUBLE PRECISION NOT NULL DEFAULT 120,
  size DOUBLE PRECISION NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#d6aa4e',
  image TEXT,
  hp INTEGER,
  hp_max INTEGER,
  vision INTEGER NOT NULL DEFAULT 240,
  visible INTEGER NOT NULL DEFAULT 1,
  move DOUBLE PRECISION,
  resource_visibility TEXT NOT NULL DEFAULT 'party',
  vision_distance_units DOUBLE PRECISION,
  rotation DOUBLE PRECISION NOT NULL DEFAULT 0,
  elevation DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (campaign_id, scene_id, character_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_map_tokens_scene
  ON campaign_map_tokens(campaign_id, scene_id);
CREATE TABLE IF NOT EXISTS campaign_map_fog (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  width DOUBLE PRECISION NOT NULL,
  height DOUBLE PRECISION NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_map_reveals (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  token_id TEXT,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  radius DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_map_reveals_personal (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  token_id TEXT,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  radius DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_map_templates (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'circle',
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  direction_deg DOUBLE PRECISION NOT NULL DEFAULT 0,
  distance_units DOUBLE PRECISION NOT NULL DEFAULT 0,
  angle_deg DOUBLE PRECISION NOT NULL DEFAULT 53,
  width_units DOUBLE PRECISION NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#3fe0d0',
  label TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  lifecycle TEXT NOT NULL DEFAULT 'manual',
  expires_at TIMESTAMPTZ,
  revision INTEGER NOT NULL DEFAULT 0,
  resolved_at TIMESTAMPTZ,
  resolved_round INTEGER,
  owner_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_map_props (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  w DOUBLE PRECISION NOT NULL DEFAULT 32,
  h DOUBLE PRECISION NOT NULL DEFAULT 32,
  hp DOUBLE PRECISION NOT NULL DEFAULT 10,
  hp_max DOUBLE PRECISION NOT NULL DEFAULT 10,
  material TEXT NOT NULL DEFAULT 'wood',
  label TEXT,
  color TEXT NOT NULL DEFAULT '#8a7455',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_map_pings (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  color TEXT NOT NULL DEFAULT '#3fe0d0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_campaign_map_pings_created
  ON campaign_map_pings(campaign_id, created_at);
CREATE TABLE IF NOT EXISTS campaign_map_walls (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  x1 DOUBLE PRECISION NOT NULL,
  y1 DOUBLE PRECISION NOT NULL,
  x2 DOUBLE PRECISION NOT NULL,
  y2 DOUBLE PRECISION NOT NULL,
  kind TEXT NOT NULL DEFAULT 'wall',
  open INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_map_lights (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'ambient',
  x DOUBLE PRECISION NOT NULL DEFAULT 0,
  y DOUBLE PRECISION NOT NULL DEFAULT 0,
  token_id TEXT,
  bright_units DOUBLE PRECISION NOT NULL DEFAULT 0,
  dim_units DOUBLE PRECISION NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#f0ead8',
  label TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_map_drawings (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  points TEXT NOT NULL DEFAULT '[]',
  color TEXT NOT NULL DEFAULT '#3fe0d0',
  width DOUBLE PRECISION NOT NULL DEFAULT 3,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaign_map_pins (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL REFERENCES campaign_map_scenes(id) ON DELETE CASCADE,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  icon TEXT NOT NULL DEFAULT '•',
  label TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'all',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_campaign_map_fog_scene
  ON campaign_map_fog(campaign_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_campaign_map_reveals_scene
  ON campaign_map_reveals(campaign_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_campaign_map_reveals_personal_scene
  ON campaign_map_reveals_personal(campaign_id, scene_id, username);
CREATE INDEX IF NOT EXISTS idx_campaign_map_templates_scene
  ON campaign_map_templates(campaign_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_campaign_map_props_scene
  ON campaign_map_props(campaign_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_campaign_map_walls_scene
  ON campaign_map_walls(campaign_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_campaign_map_lights_scene
  ON campaign_map_lights(campaign_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_campaign_map_drawings_scene
  ON campaign_map_drawings(campaign_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_campaign_map_pins_scene
  ON campaign_map_pins(campaign_id, scene_id);
