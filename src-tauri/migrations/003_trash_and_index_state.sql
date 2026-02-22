CREATE TABLE IF NOT EXISTS notes_trash (
  id TEXT PRIMARY KEY,
  note_id TEXT,
  title TEXT NOT NULL,
  original_path TEXT NOT NULL,
  trashed_path TEXT NOT NULL,
  deleted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_trash_deleted_at ON notes_trash(deleted_at);
CREATE INDEX IF NOT EXISTS idx_notes_trash_original_path ON notes_trash(original_path);

CREATE TABLE IF NOT EXISTS inbox_trash (
  inbox_item_id TEXT PRIMARY KEY,
  previous_status TEXT NOT NULL,
  deleted_at TEXT NOT NULL,
  FOREIGN KEY (inbox_item_id) REFERENCES inbox_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inbox_trash_deleted_at ON inbox_trash(deleted_at);

CREATE TABLE IF NOT EXISTS vault_index_state (
  path TEXT PRIMARY KEY,
  mtime_ms INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  last_indexed_at TEXT NOT NULL
);
