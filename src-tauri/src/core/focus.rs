use anyhow::{anyhow, bail, Result};
use chrono::{Duration, Utc};
use rusqlite::{params, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

use crate::core::{
    state::AppState,
    types::{DashboardOverview, FocusSessionView, FocusStats, ProjectFocusStat, ProjectState},
    utils::{duration_between_secs, now_rfc3339},
};

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
      "INSERT INTO focus_sessions (id, project_id, task_id, started_at, ended_at, duration_sec, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, NULL, NULL, ?4, ?4)",
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
            duration_sec: None,
        })
    }

    pub fn focus_stop(&self) -> Result<FocusSessionView> {
        let conn = self.conn()?;
        let session = conn
            .query_row(
                "SELECT id, project_id, task_id, started_at FROM focus_sessions
         WHERE ended_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .optional()?;

        let (id, project_id, task_id, started_at) =
            session.ok_or_else(|| anyhow!("no active focus session"))?;
        let ended_at = now_rfc3339();
        let duration_sec = duration_between_secs(&started_at, &ended_at)?;

        conn.execute(
            "UPDATE focus_sessions
       SET ended_at = ?1, duration_sec = ?2, updated_at = ?1
       WHERE id = ?3",
            params![ended_at, duration_sec, id],
        )?;
        self.insert_event(
            &conn,
            "focus.stopped",
            "focus_session",
            Some(&id),
            &json!({ "duration_sec": duration_sec }),
        )?;

        Ok(FocusSessionView {
            id,
            project_id,
            task_id,
            started_at,
            ended_at: Some(ended_at),
            duration_sec: Some(duration_sec),
        })
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
