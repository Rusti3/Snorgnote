use anyhow::Result;
use chrono::{Datelike, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;

use crate::core::{
    state::AppState,
    types::{DailyPlan, WeeklyPlan},
    utils::now_rfc3339,
};

#[derive(Debug, Clone)]
pub(crate) struct ReviewCandidate {
    pub path: String,
    pub title: String,
    pub due_at: String,
}

#[derive(Debug, Clone)]
struct TaskCandidate {
    title: String,
    energy: String,
    project_name: String,
}

impl AppState {
    pub fn planner_generate_daily(&self) -> Result<DailyPlan> {
        let conn = self.conn()?;
        self.generate_daily_plan(&conn)
    }

    pub fn planner_generate_weekly(&self) -> Result<WeeklyPlan> {
        let conn = self.conn()?;
        self.generate_weekly_plan(&conn)
    }

    pub(crate) fn generate_daily_plan(&self, conn: &Connection) -> Result<DailyPlan> {
        let mut task_stmt = conn.prepare(
            "SELECT t.title, t.energy, COALESCE(p.name, 'General')
       FROM tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status IN ('todo', 'in_progress')
       ORDER BY
         CASE t.energy WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         COALESCE(t.due_at, '9999-12-31T23:59:59Z') ASC,
         t.created_at ASC
       LIMIT 12",
        )?;

        let tasks = task_stmt
            .query_map([], |row| {
                Ok(TaskCandidate {
                    title: row.get(0)?,
                    energy: row.get(1)?,
                    project_name: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let review_candidates = self.select_due_reviews(conn, 2)?;
        let mut suggestions = Vec::new();

        if let Some(task) = tasks
            .iter()
            .find(|task| task.energy.eq_ignore_ascii_case("high"))
            .or_else(|| tasks.first())
        {
            suggestions.push(format!(
                "Important: {} [{}]",
                task.title.trim(),
                task.project_name
            ));
        }

        if let Some(task) = tasks
            .iter()
            .find(|task| task.energy.eq_ignore_ascii_case("low"))
            .or_else(|| tasks.get(1))
        {
            suggestions.push(format!(
                "Light: {} [{}]",
                task.title.trim(),
                task.project_name
            ));
        }

        suggestions
            .push("Recovery: walk, stretch, and close one stress loop before evening".to_string());

        for review in review_candidates {
            if suggestions.len() >= 5 {
                break;
            }
            suggestions.push(format!("Recall: [[{}|{}]]", review.path, review.title));
        }

        if suggestions.len() < 5 {
            let inbox_new: i64 = conn.query_row(
                "SELECT COUNT(*) FROM inbox_items WHERE status IN ('new', 'queued')",
                [],
                |row| row.get(0),
            )?;
            if inbox_new > 0 {
                suggestions.push(format!(
                    "Inbox: process at least {} new items",
                    inbox_new.min(5)
                ));
            }
        }
        suggestions.truncate(5);

        let date = Utc::now().date_naive().format("%Y-%m-%d").to_string();
        let path = format!("Daily/{date}.md");
        let mut markdown = String::new();
        markdown.push_str(&format!("# Daily {date}\n\n"));
        markdown.push_str("## Suggested actions\n");
        for suggestion in &suggestions {
            markdown.push_str(&format!("- [ ] {suggestion}\n"));
        }
        markdown.push_str("\n## Logistics check\n");
        markdown.push_str("- [ ] Clear one bottleneck from inbox/jobs\n");
        markdown.push_str("- [ ] Ship one concrete artifact to the vault\n");

        let saved = self.vault_save_note(&path, &markdown)?;
        self.insert_event(
            conn,
            "daily.generated",
            "note",
            Some(&saved.id),
            &json!({ "path": path }),
        )?;

        Ok(DailyPlan {
            date,
            path,
            suggestions,
            markdown,
        })
    }

    pub(crate) fn generate_weekly_plan(&self, conn: &Connection) -> Result<WeeklyPlan> {
        let now = Utc::now();
        let since = (now - Duration::days(7)).to_rfc3339();

        let tasks_done: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE status = 'done' AND updated_at >= ?1",
            params![since],
            |row| row.get(0),
        )?;
        let focus_minutes: i64 = conn.query_row(
            "SELECT COALESCE(SUM(duration_sec), 0) / 60 FROM focus_sessions
       WHERE ended_at IS NOT NULL AND started_at >= ?1",
            params![since],
            |row| row.get(0),
        )?;
        let inbox_processed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM inbox_items WHERE status = 'processed' AND updated_at >= ?1",
            params![since],
            |row| row.get(0),
        )?;
        let top_project = conn
            .query_row(
                "SELECT name FROM projects ORDER BY xp DESC LIMIT 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .unwrap_or_else(|| "General".to_string());

        let highlights = vec![
            format!("Completed tasks: {tasks_done}"),
            format!("Focus minutes: {focus_minutes}"),
            format!("Inbox processed: {inbox_processed}"),
            format!("Top project biome: {top_project}"),
            "Prepare 3 concrete wins for the next week".to_string(),
        ];

        let iso = now.iso_week();
        let week = format!("{}-W{:02}", iso.year(), iso.week());
        let path = format!("Weekly/{week}.md");
        let mut markdown = String::new();
        markdown.push_str(&format!("# Weekly {week}\n\n"));
        markdown.push_str("## Review\n");
        for line in &highlights {
            markdown.push_str(&format!("- {line}\n"));
        }
        markdown.push_str("\n## Focus for next week\n");
        markdown.push_str("- [ ] Define one strategic objective\n");
        markdown.push_str("- [ ] Reserve recovery blocks\n");
        markdown.push_str("- [ ] Front-load high-value logistics\n");

        let saved = self.vault_save_note(&path, &markdown)?;
        self.insert_event(
            conn,
            "weekly.generated",
            "note",
            Some(&saved.id),
            &json!({ "path": path }),
        )?;

        Ok(WeeklyPlan {
            week,
            path,
            highlights,
            markdown,
        })
    }

    pub(crate) fn select_due_reviews(
        &self,
        conn: &Connection,
        limit: u32,
    ) -> Result<Vec<ReviewCandidate>> {
        let mut stmt = conn.prepare(
            "SELECT n.path, n.title, COALESCE(r.due_at, '')
       FROM reviews r
       JOIN notes n ON n.id = r.note_id
       WHERE r.due_at IS NOT NULL AND r.due_at <= ?1
       ORDER BY r.due_at ASC
       LIMIT ?2",
        )?;

        let reviews = stmt
            .query_map(params![now_rfc3339(), i64::from(limit)], |row| {
                Ok(ReviewCandidate {
                    path: row.get(0)?,
                    title: row.get(1)?,
                    due_at: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(reviews)
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use crate::core::state::AppState;

    #[test]
    fn planner_generates_3_to_5_suggestions() {
        let temp = tempdir().expect("temp dir");
        let state = AppState::for_test(temp.path()).expect("state");
        let _ = state
            .inbox_add_item(
                "quick_note".to_string(),
                "Ship docs and prepare test plan.".to_string(),
                vec!["planning".to_string()],
                None,
            )
            .expect("insert inbox");
        let _ = state.inbox_process(1).expect("process");

        let daily = state.planner_generate_daily().expect("daily plan");
        assert!(daily.suggestions.len() >= 3);
        assert!(daily.suggestions.len() <= 5);
    }
}
