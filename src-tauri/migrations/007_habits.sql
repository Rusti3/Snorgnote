CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  frequency_type TEXT NOT NULL,
  frequency_value_json TEXT NOT NULL DEFAULT '{}',
  project_id TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL,
  log_date TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
  UNIQUE (habit_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_habits_archived_updated ON habits(archived, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_habits_project ON habits(project_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date_habit ON habit_logs(log_date, habit_id);
