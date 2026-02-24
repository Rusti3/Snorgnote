use std::collections::BTreeSet;

use anyhow::{anyhow, bail, Result};
use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

use crate::core::{
    state::AppState,
    types::{
        DashboardOverview, FocusHistoryItem, FocusHistoryPage, FocusSessionView, FocusStats,
        ProjectAssignNotesReport, ProjectDetails, ProjectFocusStat, ProjectNoteBlock, ProjectState,
        ProjectTaskView,
    },
    utils::{duration_between_secs, now_rfc3339, parse_frontmatter},
};

#[derive(Debug, Clone)]
struct ActiveSessionRow {
    id: String,
    project_id: Option<String>,
    task_id: Option<String>,
    started_at: String,
    paused_at: Option<String>,
    paused_total_sec: i64,
}

fn fetch_active_session(conn: &Connection) -> Result<Option<ActiveSessionRow>> {
    let row = conn
        .query_row(
            "SELECT id, project_id, task_id, started_at, paused_at, COALESCE(paused_total_sec, 0)
             FROM focus_sessions
             WHERE ended_at IS NULL
             ORDER BY started_at DESC
             LIMIT 1",
            [],
            |row| {
                Ok(ActiveSessionRow {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    task_id: row.get(2)?,
                    started_at: row.get(3)?,
                    paused_at: row.get(4)?,
                    paused_total_sec: row.get(5)?,
                })
            },
        )
        .optional()?;
    Ok(row)
}

fn elapsed_without_pauses(
    started_at: &str,
    reference_at: &str,
    paused_total_sec: i64,
    paused_at: Option<&str>,
) -> Result<i64> {
    let base = duration_between_secs(started_at, reference_at)?;
    let current_pause = match paused_at {
        Some(paused) => duration_between_secs(paused, reference_at)?,
        None => 0,
    };
    Ok((base - paused_total_sec - current_pause).max(0))
}

fn build_focus_view(
    session: &ActiveSessionRow,
    ended_at: Option<String>,
    duration_sec: Option<i64>,
    paused_at: Option<String>,
    paused_total_sec: i64,
    status: &str,
    elapsed_sec: i64,
) -> FocusSessionView {
    FocusSessionView {
        id: session.id.clone(),
        project_id: session.project_id.clone(),
        task_id: session.task_id.clone(),
        started_at: session.started_at.clone(),
        ended_at,
        paused_at,
        paused_total_sec: Some(paused_total_sec),
        duration_sec,
        status: Some(status.to_string()),
        elapsed_sec: Some(elapsed_sec),
    }
}

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
    pub fn focus_start(
        &self,
        project_id: Option<String>,
        task_id: Option<String>,
    ) -> Result<FocusSessionView> {
        let conn = self.conn()?;
        let active_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM focus_sessions WHERE ended_at IS NULL",
            [],
            |row| row.get(0),
        )?;
        if active_count > 0 {
            bail!("a focus session is already running");
        }

        let now = now_rfc3339();
        let session_id = Uuid::new_v4().to_string();
        conn.execute(
      "INSERT INTO focus_sessions (
          id, project_id, task_id, started_at, ended_at, paused_at, paused_total_sec, duration_sec, created_at, updated_at
       ) VALUES (?1, ?2, ?3, ?4, NULL, NULL, 0, NULL, ?4, ?4)",
      params![session_id, project_id, task_id, now],
    )?;
        self.insert_event(
            &conn,
            "focus.started",
            "focus_session",
            Some(&session_id),
            &json!({}),
        )?;

        Ok(FocusSessionView {
            id: session_id,
            project_id,
            task_id,
            started_at: now,
            ended_at: None,
            paused_at: None,
            paused_total_sec: Some(0),
            duration_sec: None,
            status: Some("running".to_string()),
            elapsed_sec: Some(0),
        })
    }

    pub fn focus_active(&self) -> Result<Option<FocusSessionView>> {
        let conn = self.conn()?;
        let Some(session) = fetch_active_session(&conn)? else {
            return Ok(None);
        };

        let now = now_rfc3339();
        let elapsed_sec = elapsed_without_pauses(
            &session.started_at,
            &now,
            session.paused_total_sec,
            session.paused_at.as_deref(),
        )?;
        let status = if session.paused_at.is_some() {
            "paused"
        } else {
            "running"
        };

        Ok(Some(build_focus_view(
            &session,
            None,
            None,
            session.paused_at.clone(),
            session.paused_total_sec,
            status,
            elapsed_sec,
        )))
    }

    pub fn focus_pause(&self) -> Result<FocusSessionView> {
        let conn = self.conn()?;
        let session =
            fetch_active_session(&conn)?.ok_or_else(|| anyhow!("no active focus session"))?;
        if session.paused_at.is_some() {
            bail!("active session is already paused");
        }

        let now = now_rfc3339();
        conn.execute(
            "UPDATE focus_sessions SET paused_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now, session.id],
        )?;
        self.insert_event(
            &conn,
            "focus.paused",
            "focus_session",
            Some(&session.id),
            &json!({}),
        )?;

        let elapsed_sec =
            elapsed_without_pauses(&session.started_at, &now, session.paused_total_sec, None)?;
        Ok(build_focus_view(
            &session,
            None,
            None,
            Some(now),
            session.paused_total_sec,
            "paused",
            elapsed_sec,
        ))
    }

    pub fn focus_resume(&self) -> Result<FocusSessionView> {
        let conn = self.conn()?;
        let session =
            fetch_active_session(&conn)?.ok_or_else(|| anyhow!("no active focus session"))?;
        let paused_at = session
            .paused_at
            .clone()
            .ok_or_else(|| anyhow!("active session is not paused"))?;

        let now = now_rfc3339();
        let paused_delta = duration_between_secs(&paused_at, &now)?;
        let paused_total_sec = session.paused_total_sec + paused_delta;
        conn.execute(
            "UPDATE focus_sessions
             SET paused_at = NULL, paused_total_sec = ?1, updated_at = ?2
             WHERE id = ?3",
            params![paused_total_sec, now, session.id],
        )?;
        self.insert_event(
            &conn,
            "focus.resumed",
            "focus_session",
            Some(&session.id),
            &json!({ "paused_delta_sec": paused_delta }),
        )?;

        let elapsed_sec =
            elapsed_without_pauses(&session.started_at, &now, paused_total_sec, None)?;
        Ok(build_focus_view(
            &session,
            None,
            None,
            None,
            paused_total_sec,
            "running",
            elapsed_sec,
        ))
    }

    pub fn focus_stop(&self) -> Result<FocusSessionView> {
        let conn = self.conn()?;
        let session =
            fetch_active_session(&conn)?.ok_or_else(|| anyhow!("no active focus session"))?;

        let ended_at = now_rfc3339();
        let extra_paused = match session.paused_at.as_deref() {
            Some(paused_at) => duration_between_secs(paused_at, &ended_at)?,
            None => 0,
        };
        let paused_total_sec = session.paused_total_sec + extra_paused;
        let base_duration = duration_between_secs(&session.started_at, &ended_at)?;
        let duration_sec = (base_duration - paused_total_sec).max(0);

        conn.execute(
            "UPDATE focus_sessions
             SET ended_at = ?1, paused_at = NULL, paused_total_sec = ?2, duration_sec = ?3, updated_at = ?1
             WHERE id = ?4",
            params![ended_at, paused_total_sec, duration_sec, session.id],
        )?;
        self.insert_event(
            &conn,
            "focus.stopped",
            "focus_session",
            Some(&session.id),
            &json!({ "duration_sec": duration_sec }),
        )?;

        Ok(build_focus_view(
            &session,
            Some(ended_at),
            Some(duration_sec),
            None,
            paused_total_sec,
            "stopped",
            duration_sec,
        ))
    }

    pub fn focus_stats(&self, days: u32) -> Result<FocusStats> {
        let conn = self.conn()?;
        let since = (Utc::now() - Duration::days(i64::from(days))).to_rfc3339();

        let (sessions, total_minutes): (i64, i64) = conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(duration_sec), 0) / 60
       FROM focus_sessions
       WHERE ended_at IS NOT NULL AND started_at >= ?1",
            params![since],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let mut stmt = conn.prepare(
            "SELECT COALESCE(project_id, 'unassigned'), COALESCE(SUM(duration_sec), 0) / 60
       FROM focus_sessions
       WHERE ended_at IS NOT NULL AND started_at >= ?1
       GROUP BY COALESCE(project_id, 'unassigned')
       ORDER BY 2 DESC",
        )?;
        let by_project = stmt
            .query_map(params![since], |row| {
                Ok(ProjectFocusStat {
                    project_id: row.get(0)?,
                    minutes: row.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(FocusStats {
            total_minutes,
            sessions,
            by_project,
        })
    }

    pub fn focus_history(
        &self,
        limit: u32,
        offset: u32,
        project_id: Option<String>,
        started_from: Option<String>,
        started_to: Option<String>,
    ) -> Result<FocusHistoryPage> {
        let conn = self.conn()?;
        let project_filter = project_id.as_deref();
        let from_filter = started_from.as_deref();
        let to_filter = started_to.as_deref();

        let total: i64 = conn.query_row(
            "SELECT COUNT(*)
             FROM focus_sessions
             WHERE ended_at IS NOT NULL
               AND (?1 IS NULL OR project_id = ?1)
               AND (?2 IS NULL OR started_at >= ?2)
               AND (?3 IS NULL OR started_at <= ?3)",
            params![project_filter, from_filter, to_filter],
            |row| row.get(0),
        )?;

        let mut stmt = conn.prepare(
            "SELECT
                id,
                project_id,
                task_id,
                started_at,
                ended_at,
                COALESCE(paused_total_sec, 0),
                duration_sec
             FROM focus_sessions
             WHERE ended_at IS NOT NULL
               AND (?1 IS NULL OR project_id = ?1)
               AND (?2 IS NULL OR started_at >= ?2)
               AND (?3 IS NULL OR started_at <= ?3)
             ORDER BY ended_at DESC, started_at DESC
             LIMIT ?4 OFFSET ?5",
        )?;

        let items = stmt
            .query_map(
                params![
                    project_filter,
                    from_filter,
                    to_filter,
                    i64::from(limit),
                    i64::from(offset)
                ],
                |row| {
                    Ok(FocusHistoryItem {
                        id: row.get(0)?,
                        project_id: row.get(1)?,
                        task_id: row.get(2)?,
                        started_at: row.get(3)?,
                        ended_at: row.get(4)?,
                        paused_total_sec: row.get(5)?,
                        duration_sec: row.get(6)?,
                    })
                },
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(FocusHistoryPage {
            items,
            total,
            limit,
            offset,
        })
    }

    pub fn dashboard_overview(&self) -> Result<DashboardOverview> {
        let conn = self.conn()?;
        let today = Utc::now().date_naive().format("%Y-%m-%d").to_string();

        let notes: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))?;
        let inbox_new: i64 = conn.query_row(
            "SELECT COUNT(*) FROM inbox_items WHERE status IN ('new', 'queued')",
            [],
            |row| row.get(0),
        )?;
        let jobs_queued: i64 = conn.query_row(
            "SELECT COUNT(*) FROM jobs WHERE state IN ('queued', 'retrying', 'running')",
            [],
            |row| row.get(0),
        )?;
        let focus_minutes_today: i64 = conn.query_row(
            "SELECT COALESCE(SUM(duration_sec), 0) / 60
       FROM focus_sessions
       WHERE ended_at IS NOT NULL AND started_at LIKE ?1",
            params![format!("{today}%")],
            |row| row.get(0),
        )?;
        let reviews_due: i64 = conn.query_row(
            "SELECT COUNT(*) FROM reviews WHERE due_at IS NOT NULL AND due_at <= ?1",
            params![now_rfc3339()],
            |row| row.get(0),
        )?;
        let projects_active: i64 =
            conn.query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))?;

        Ok(DashboardOverview {
            notes,
            inbox_new,
            jobs_queued,
            focus_minutes_today,
            reviews_due,
            projects_active,
        })
    }

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
    use chrono::{Duration, Utc};
    use rusqlite::params;
    use tempfile::tempdir;

    use crate::core::state::AppState;

    #[test]
    fn focus_pause_requires_active_session() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let error = state
            .focus_pause()
            .expect_err("pause without active session must fail");
        assert!(error.to_string().contains("no active focus session"));
        Ok(())
    }

    #[test]
    fn focus_resume_requires_paused_session() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        let _ = state.focus_start(Some("project_general".to_string()), None)?;

        let error = state
            .focus_resume()
            .expect_err("resume without pause must fail");
        assert!(error.to_string().contains("active session is not paused"));
        Ok(())
    }

    #[test]
    fn focus_stop_excludes_paused_time_from_duration() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        let started = state.focus_start(Some("project_general".to_string()), None)?;

        let conn = state.conn()?;
        let started_at = (Utc::now() - Duration::seconds(120)).to_rfc3339();
        conn.execute(
            "UPDATE focus_sessions SET started_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![started_at, started.id],
        )?;
        drop(conn);

        let paused = state.focus_pause()?;
        assert_eq!(paused.status.as_deref(), Some("paused"));

        let conn = state.conn()?;
        let paused_at = (Utc::now() - Duration::seconds(60)).to_rfc3339();
        conn.execute(
            "UPDATE focus_sessions SET paused_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![paused_at, started.id],
        )?;
        drop(conn);

        let resumed = state.focus_resume()?;
        assert_eq!(resumed.status.as_deref(), Some("running"));
        assert_eq!(resumed.paused_at, None);
        assert!(resumed.paused_total_sec.unwrap_or_default() >= 60);

        let stopped = state.focus_stop()?;
        let duration_sec = stopped.duration_sec.unwrap_or_default();
        assert!(duration_sec >= 58 && duration_sec <= 62);
        assert_eq!(stopped.status.as_deref(), Some("stopped"));
        Ok(())
    }

    #[test]
    fn focus_active_reflects_running_and_paused_session() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        assert!(state.focus_active()?.is_none());

        let started = state.focus_start(Some("project_general".to_string()), None)?;
        let active_running = state.focus_active()?.expect("active session expected");
        assert_eq!(active_running.id, started.id);
        assert_eq!(active_running.status.as_deref(), Some("running"));

        let _ = state.focus_pause()?;
        let active_paused = state.focus_active()?.expect("paused session expected");
        assert_eq!(active_paused.status.as_deref(), Some("paused"));
        assert!(active_paused.paused_at.is_some());
        Ok(())
    }

    #[test]
    fn focus_history_returns_completed_sessions_only() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let first = state.focus_start(Some("project_general".to_string()), None)?;
        state.focus_stop()?;

        let second = state.focus_start(Some("project_life".to_string()), None)?;
        state.focus_stop()?;

        let _active = state.focus_start(Some("project_general".to_string()), None)?;

        let page = state.focus_history(20, 0, None, None, None)?;
        assert_eq!(page.items.len(), 2);
        assert_eq!(page.total, 2);
        assert_eq!(page.items[0].id, second.id);
        assert_eq!(page.items[1].id, first.id);
        assert!(page.items.iter().all(|item| item.ended_at.is_some()));

        Ok(())
    }

    #[test]
    fn focus_history_supports_project_filter_and_pagination() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        state.focus_start(Some("project_general".to_string()), None)?;
        state.focus_stop()?;

        state.focus_start(Some("project_general".to_string()), None)?;
        state.focus_stop()?;

        state.focus_start(Some("project_life".to_string()), None)?;
        state.focus_stop()?;

        let filtered =
            state.focus_history(50, 0, Some("project_general".to_string()), None, None)?;
        assert_eq!(filtered.total, 2);
        assert_eq!(filtered.items.len(), 2);
        assert!(filtered
            .items
            .iter()
            .all(|item| item.project_id.as_deref() == Some("project_general")));

        let paged = state.focus_history(1, 1, Some("project_general".to_string()), None, None)?;
        assert_eq!(paged.items.len(), 1);
        assert_eq!(paged.total, 2);
        assert_eq!(paged.limit, 1);
        assert_eq!(paged.offset, 1);

        Ok(())
    }

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
