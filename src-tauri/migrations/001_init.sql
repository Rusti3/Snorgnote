PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_md TEXT NOT NULL,
  frontmatter_json TEXT NOT NULL DEFAULT '{}',
  project_id TEXT,
  source_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_links (
  id TEXT PRIMARY KEY,
  from_note_id TEXT NOT NULL,
  to_path TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'wiki',
  FOREIGN KEY (from_note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  mime TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  checksum TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inbox_items (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  raw_payload_json TEXT NOT NULL DEFAULT '{}',
  content_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  project_hint TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  dedup_key TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  skill_id TEXT,
  job_type TEXT NOT NULL,
  input_ref TEXT,
  state TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  config_yaml TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  biome_type TEXT NOT NULL DEFAULT 'general',
  health REAL NOT NULL DEFAULT 50,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  note_id TEXT,
  project_id TEXT,
  due_at TEXT,
  energy TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'todo',
  source_job_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE SET NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  task_id TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_sec INTEGER,
  mood_before INTEGER,
  mood_after INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  note_id TEXT PRIMARY KEY,
  last_reviewed_at TEXT,
  interval_days INTEGER NOT NULL DEFAULT 1,
  stability REAL NOT NULL DEFAULT 1.0,
  importance REAL NOT NULL DEFAULT 1.0,
  due_at TEXT,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS metrics_daily (
  date TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  metric_value REAL NOT NULL,
  PRIMARY KEY (date, metric_key)
);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  body_md,
  tags_text
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_note_links_from ON note_links(from_note_id);
CREATE INDEX IF NOT EXISTS idx_inbox_status_created ON inbox_items(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_state_scheduled ON jobs(state, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at);
CREATE INDEX IF NOT EXISTS idx_focus_started_at ON focus_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(type, created_at);
