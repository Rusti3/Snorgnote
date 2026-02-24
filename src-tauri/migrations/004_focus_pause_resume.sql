CREATE INDEX IF NOT EXISTS idx_focus_active_paused
ON focus_sessions(ended_at, paused_at);
