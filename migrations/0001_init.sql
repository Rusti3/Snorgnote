-- Core event store
CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  actor TEXT NOT NULL,
  stream TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  causation_id TEXT,
  correlation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_stream_ts ON events(stream, ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts);

-- Inbox
CREATE TABLE IF NOT EXISTS inbox_items(
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  captured_at INTEGER NOT NULL,
  content_md TEXT NOT NULL,
  meta_json TEXT NOT NULL,
  status TEXT NOT NULL,
  project_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_inbox_status_captured ON inbox_items(status, captured_at);

-- Jobs
CREATE TABLE IF NOT EXISTS jobs(
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL,
  run_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  error TEXT,
  dedupe_key TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status_run_at ON jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_dedupe ON jobs(kind, dedupe_key);

-- Skills
CREATE TABLE IF NOT EXISTS skills(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  manifest_path TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Notes index + graph
CREATE TABLE IF NOT EXISTS notes(
  id TEXT PRIMARY KEY,
  vault_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  project_id TEXT,
  updated_at INTEGER NOT NULL,
  hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_edges(
  src_note_id TEXT NOT NULL,
  dst_note_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  weight REAL NOT NULL,
  PRIMARY KEY(src_note_id, dst_note_id, edge_type)
);

-- Task extraction
CREATE TABLE IF NOT EXISTS tasks(
  id TEXT PRIMARY KEY,
  source_note_id TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  priority INTEGER NOT NULL,
  due_at INTEGER,
  project_id TEXT,
  next_action TEXT
);

-- Focus
CREATE TABLE IF NOT EXISTS focus_sessions(
  id TEXT PRIMARY KEY,
  task_id TEXT,
  project_id TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  planned_min INTEGER NOT NULL,
  actual_min INTEGER NOT NULL,
  outcome TEXT
);

-- Daily metrics
CREATE TABLE IF NOT EXISTS metrics_daily(
  date TEXT PRIMARY KEY,
  inbox_in INTEGER NOT NULL,
  inbox_done INTEGER NOT NULL,
  notes_created INTEGER NOT NULL,
  tasks_done INTEGER NOT NULL,
  focus_min INTEGER NOT NULL,
  review_done INTEGER NOT NULL,
  mood_score REAL
);

-- Full text index for notes
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  note_id UNINDEXED,
  title,
  body,
  tags
);
