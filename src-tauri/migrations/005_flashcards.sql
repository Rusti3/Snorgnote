CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  front_md TEXT NOT NULL,
  back_md TEXT NOT NULL,
  source_note_id TEXT,
  source_note_path TEXT,
  vault_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  is_manual INTEGER NOT NULL DEFAULT 1,
  due_at TEXT NOT NULL,
  last_reviewed_at TEXT,
  interval_days INTEGER NOT NULL DEFAULT 0,
  ease_factor REAL NOT NULL DEFAULT 2.5,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS flashcard_reviews (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  grade TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  prev_due_at TEXT NOT NULL,
  next_due_at TEXT NOT NULL,
  prev_interval_days INTEGER NOT NULL,
  next_interval_days INTEGER NOT NULL,
  FOREIGN KEY (card_id) REFERENCES flashcards(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_flashcards_source_note_unique
ON flashcards(source_note_id)
WHERE source_note_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_flashcards_due_status
ON flashcards(due_at, status);

CREATE INDEX IF NOT EXISTS idx_flashcards_source_note_id
ON flashcards(source_note_id);

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_card_id_reviewed_at
ON flashcard_reviews(card_id, reviewed_at);
