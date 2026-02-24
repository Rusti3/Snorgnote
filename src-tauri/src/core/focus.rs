use anyhow::{anyhow, bail, Result};
use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

use crate::core::{
    state::AppState,
    types::{DashboardOverview, FocusSessionView, FocusStats, ProjectFocusStat, ProjectState},
    utils::{duration_between_secs, now_rfc3339},
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
        let session = fetch_active_session(&conn)?.ok_or_else(|| anyhow!("no active focus session"))?;
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
        let session = fetch_active_session(&conn)?.ok_or_else(|| anyhow!("no active focus session"))?;
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

        let elapsed_sec = elapsed_without_pauses(&session.started_at, &now, paused_total_sec, None)?;
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
        let session = fetch_active_session(&conn)?.ok_or_else(|| anyhow!("no active focus session"))?;

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
}
