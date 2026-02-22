CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_binding (
  id TEXT PRIMARY KEY,
  telegram_user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  chat_id TEXT NOT NULL UNIQUE,
  verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_ingest_checkpoint (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_verification_nonce (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_binding_username ON telegram_binding(username);
CREATE INDEX IF NOT EXISTS idx_telegram_nonce_username_created ON telegram_verification_nonce(username, created_at);
