CREATE INDEX IF NOT EXISTS idx_notes_project_updated
ON notes(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status_due
ON tasks(project_id, status, due_at);
