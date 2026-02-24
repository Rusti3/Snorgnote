use std::collections::BTreeSet;

use anyhow::{anyhow, bail, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

use crate::core::{
    state::AppState,
    types::{
        ProjectAssignNotesReport, ProjectDetails, ProjectNoteBlock, ProjectState, ProjectTaskView,
    },
    utils::{now_rfc3339, parse_frontmatter},
};

fn normalize_task_status(value: &str) -> Result<String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "todo" => Ok("todo".to_string()),
        "in_progress" => Ok("in_progress".to_string()),
        "done" => Ok("done".to_string()),
        other => bail!("invalid task status `{other}`"),
    }
}

fn normalize_task_energy(value: &str) -> Result<String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "low" => Ok("low".to_string()),
        "medium" => Ok("medium".to_string()),
        "high" => Ok("high".to_string()),
        other => bail!("invalid task energy `{other}`"),
    }
}

fn note_preview(body_md: &str) -> String {
    let (_, content) = parse_frontmatter(body_md);
    let compact = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    if compact.is_empty() {
        return String::new();
    }

    if compact.chars().count() > 220 {
        format!("{}...", compact.chars().take(217).collect::<String>())
    } else {
        compact
    }
}

impl AppState {
    pub fn projects_state(&self) -> Result<Vec<ProjectState>> {
        let conn = self.conn()?;
        let today = Utc::now().date_naive().format("%Y-%m-%d").to_string();

        let mut stmt = conn.prepare(
      "SELECT
          p.id,
          p.slug,
          p.name,
          p.biome_type,
          p.health,
          p.xp,
          p.level,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status != 'done') AS open_tasks,
          (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done' AND t.updated_at LIKE ?1) AS done_today
       FROM projects p
       ORDER BY p.xp DESC, p.name ASC",
    )?;

        let projects = stmt
            .query_map(params![format!("{today}%")], |row| {
                Ok(ProjectState {
                    id: row.get(0)?,
                    slug: row.get(1)?,
                    name: row.get(2)?,
                    biome_type: row.get(3)?,
                    health: row.get(4)?,
                    xp: row.get(5)?,
                    level: row.get(6)?,
                    open_tasks: row.get(7)?,
                    done_today: row.get(8)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(projects)
    }

    fn resolve_existing_project_id(&self, conn: &Connection, project_ref: &str) -> Result<String> {
        let normalized = project_ref.trim();
        if normalized.is_empty() {
            bail!("project id cannot be empty");
        }

        let by_id = conn
            .query_row(
                "SELECT id FROM projects WHERE id = ?1",
                params![normalized],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if let Some(project_id) = by_id {
            return Ok(project_id);
        }

        let by_slug = conn
            .query_row(
                "SELECT id FROM projects WHERE slug = ?1",
                params![normalized],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        by_slug.ok_or_else(|| anyhow!("project `{normalized}` not found"))
    }

    fn project_task_by_id(&self, conn: &Connection, task_id: &str) -> Result<ProjectTaskView> {
        let task = conn
            .query_row(
                "SELECT id, title, status, energy, due_at, updated_at
                 FROM tasks
                 WHERE id = ?1
                 LIMIT 1",
                params![task_id],
                |row| {
                    Ok(ProjectTaskView {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        status: row.get(2)?,
                        energy: row.get(3)?,
                        due_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )
            .optional()?;
        task.ok_or_else(|| anyhow!("task `{task_id}` not found"))
    }

    pub fn projects_assign_notes(
        &self,
        project_id: String,
        note_paths: Vec<String>,
    ) -> Result<ProjectAssignNotesReport> {
        let conn = self.conn()?;
        let normalized_project_id = self.resolve_existing_project_id(&conn, &project_id)?;
        let unique_paths = note_paths
            .into_iter()
            .map(|path| path.trim().replace('\\', "/"))
            .filter(|path| !path.is_empty())
            .collect::<BTreeSet<_>>();

        if unique_paths.is_empty() {
            return Ok(ProjectAssignNotesReport {
                updated: 0,
                skipped: 0,
            });
        }

        let mut updated = 0_i64;
        let mut skipped = 0_i64;
        let now = now_rfc3339();
        for path in unique_paths {
            let changed = conn.execute(
                "UPDATE notes
                 SET project_id = ?1, updated_at = ?2
                 WHERE path = ?3",
                params![&normalized_project_id, &now, path],
            )?;
            if changed > 0 {
                updated += changed as i64;
            } else {
                skipped += 1;
            }
        }

        self.insert_event(
            &conn,
            "project.notes_assigned",
            "project",
            Some(&normalized_project_id),
            &json!({ "updated": updated, "skipped": skipped }),
        )?;

        Ok(ProjectAssignNotesReport { updated, skipped })
    }

    pub fn projects_list_details(&self) -> Result<Vec<ProjectDetails>> {
        let projects = self.projects_state()?;
        let conn = self.conn()?;

        let mut notes_stmt = conn.prepare(
            "SELECT id, path, title, updated_at, body_md
             FROM notes
             WHERE project_id = ?1
             ORDER BY updated_at DESC
             LIMIT 400",
        )?;
        let mut tasks_stmt = conn.prepare(
            "SELECT id, title, status, energy, due_at, updated_at
             FROM tasks
             WHERE project_id = ?1
             ORDER BY
               CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
               COALESCE(due_at, '9999-12-31T23:59:59Z') ASC,
               updated_at DESC
             LIMIT 400",
        )?;

        let mut details = Vec::with_capacity(projects.len());
        for project in projects {
            let notes = notes_stmt
                .query_map(params![project.id.clone()], |row| {
                    let body_md: String = row.get(4)?;
                    Ok(ProjectNoteBlock {
                        id: row.get(0)?,
                        path: row.get(1)?,
                        title: row.get(2)?,
                        updated_at: row.get(3)?,
                        preview_md: note_preview(&body_md),
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;

            let tasks = tasks_stmt
                .query_map(params![project.id.clone()], |row| {
                    Ok(ProjectTaskView {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        status: row.get(2)?,
                        energy: row.get(3)?,
                        due_at: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;

            details.push(ProjectDetails {
                project,
                notes,
                tasks,
            });
        }

        Ok(details)
    }

    pub fn projects_task_create(
        &self,
        project_id: String,
        title: String,
        status: Option<String>,
        energy: Option<String>,
        due_at: Option<String>,
    ) -> Result<ProjectTaskView> {
        let conn = self.conn()?;
        let normalized_project_id = self.resolve_existing_project_id(&conn, &project_id)?;
        let normalized_title = title.trim().to_string();
        if normalized_title.is_empty() {
            bail!("task title cannot be empty");
        }

        let normalized_status = normalize_task_status(status.as_deref().unwrap_or("todo"))?;
        let normalized_energy = normalize_task_energy(energy.as_deref().unwrap_or("medium"))?;
        let normalized_due = due_at
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);

        let task_id = Uuid::new_v4().to_string();
        let now = now_rfc3339();
        conn.execute(
            "INSERT INTO tasks (id, title, note_id, project_id, due_at, energy, status, source_job_id, created_at, updated_at)
             VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, NULL, ?7, ?7)",
            params![
                &task_id,
                &normalized_title,
                &normalized_project_id,
                &normalized_due,
                &normalized_energy,
                &normalized_status,
                &now
            ],
        )?;

        self.insert_event(
            &conn,
            "task.created",
            "task",
            Some(&task_id),
            &json!({ "project_id": normalized_project_id }),
        )?;

        self.project_task_by_id(&conn, &task_id)
    }

    pub fn projects_task_update(
        &self,
        task_id: String,
        title: Option<String>,
        status: Option<String>,
        energy: Option<String>,
        due_at: Option<String>,
    ) -> Result<ProjectTaskView> {
        let conn = self.conn()?;
        let current = conn
            .query_row(
                "SELECT title, status, energy FROM tasks WHERE id = ?1 LIMIT 1",
                params![&task_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| anyhow!("task `{task_id}` not found"))?;

        let next_title = match title {
            Some(value) => {
                let normalized = value.trim().to_string();
                if normalized.is_empty() {
                    bail!("task title cannot be empty");
                }
                normalized
            }
            None => current.0,
        };
        let next_status = match status {
            Some(value) => normalize_task_status(&value)?,
            None => current.1,
        };
        let next_energy = match energy {
            Some(value) => normalize_task_energy(&value)?,
            None => current.2,
        };
        let next_due = due_at
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string);

        conn.execute(
            "UPDATE tasks
             SET title = ?1, status = ?2, energy = ?3, due_at = ?4, updated_at = ?5
             WHERE id = ?6",
            params![
                &next_title,
                &next_status,
                &next_energy,
                &next_due,
                now_rfc3339(),
                &task_id
            ],
        )?;

        self.insert_event(&conn, "task.updated", "task", Some(&task_id), &json!({}))?;

        self.project_task_by_id(&conn, &task_id)
    }

    pub fn projects_task_delete(&self, task_id: String) -> Result<()> {
        let conn = self.conn()?;
        let deleted = conn.execute("DELETE FROM tasks WHERE id = ?1", params![&task_id])?;
        if deleted == 0 {
            bail!("task not found");
        }

        self.insert_event(&conn, "task.deleted", "task", Some(&task_id), &json!({}))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use tempfile::tempdir;

    use crate::core::state::AppState;

    #[test]
    fn projects_assign_notes_updates_project_and_counts_skipped() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        let _ = state.vault_save_note("Notes/p-a.md", "# A\n\nbody")?;
        let _ = state.vault_save_note("Notes/p-b.md", "# B\n\nbody")?;

        let report = state.projects_assign_notes(
            "project_life".to_string(),
            vec![
                "Notes/p-a.md".to_string(),
                "Notes/p-b.md".to_string(),
                "Notes/missing.md".to_string(),
            ],
        )?;
        assert_eq!(report.updated, 2);
        assert_eq!(report.skipped, 1);

        let conn = state.conn()?;
        let assigned_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM notes WHERE project_id = 'project_life' AND path IN ('Notes/p-a.md', 'Notes/p-b.md')",
            [],
            |row| row.get(0),
        )?;
        assert_eq!(assigned_count, 2);

        Ok(())
    }

    #[test]
    fn projects_details_include_notes_and_task_crud() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        let _ = state.vault_save_note("Notes/life-a.md", "# Life A\n\nalpha")?;
        let _ = state.vault_save_note("Notes/life-b.md", "# Life B\n\nbeta")?;
        let _ = state.projects_assign_notes(
            "project_life".to_string(),
            vec!["Notes/life-a.md".to_string(), "Notes/life-b.md".to_string()],
        )?;

        let created = state.projects_task_create(
            "project_life".to_string(),
            "Ship life project".to_string(),
            Some("todo".to_string()),
            Some("high".to_string()),
            Some("2030-01-01T10:00:00Z".to_string()),
        )?;
        assert_eq!(created.status, "todo");
        assert_eq!(created.energy, "high");

        let updated = state.projects_task_update(
            created.id.clone(),
            Some("Ship life project v2".to_string()),
            Some("done".to_string()),
            Some("low".to_string()),
            None,
        )?;
        assert_eq!(updated.status, "done");
        assert_eq!(updated.energy, "low");
        assert!(updated.due_at.is_none());

        let details = state.projects_list_details()?;
        let life = details
            .into_iter()
            .find(|item| item.project.id == "project_life")
            .expect("life project must exist");
        assert_eq!(life.notes.len(), 2);
        assert!(life.notes.iter().any(|note| note.path == "Notes/life-a.md"));
        assert!(life.tasks.iter().any(|task| task.id == created.id));

        state.projects_task_delete(created.id.clone())?;
        let details_after_delete = state.projects_list_details()?;
        let life_after_delete = details_after_delete
            .into_iter()
            .find(|item| item.project.id == "project_life")
            .expect("life project must exist");
        assert!(!life_after_delete
            .tasks
            .iter()
            .any(|task| task.id == created.id));

        Ok(())
    }

    #[test]
    fn projects_task_validation_rejects_invalid_status_and_energy() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let status_error = state.projects_task_create(
            "project_general".to_string(),
            "Invalid status".to_string(),
            Some("blocked".to_string()),
            Some("low".to_string()),
            None,
        );
        assert!(status_error
            .expect_err("must reject unsupported status")
            .to_string()
            .contains("invalid task status"));

        let energy_error = state.projects_task_create(
            "project_general".to_string(),
            "Invalid energy".to_string(),
            Some("todo".to_string()),
            Some("extreme".to_string()),
            None,
        );
        assert!(energy_error
            .expect_err("must reject unsupported energy")
            .to_string()
            .contains("invalid task energy"));

        Ok(())
    }
}
