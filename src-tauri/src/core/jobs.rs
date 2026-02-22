use std::collections::BTreeSet;

use anyhow::{anyhow, bail, Result};
use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

use crate::core::{
    db::upsert_metric,
    state::AppState,
    types::JobRunReport,
    utils::{extract_task_candidates, normalize_job_type, now_rfc3339, summarize_text},
};

#[derive(Debug, Clone)]
struct QueuedJob {
    id: String,
    skill_id: Option<String>,
    job_type: String,
    input_ref: Option<String>,
    attempts: i64,
}

impl AppState {
    pub(crate) fn enqueue_job(
        &self,
        conn: &Connection,
        skill_id: Option<&str>,
        job_type: &str,
        input_ref: Option<&str>,
        priority: i64,
    ) -> Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = now_rfc3339();

        conn.execute(
      "INSERT INTO jobs (id, skill_id, job_type, input_ref, state, priority, attempts, scheduled_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, 'queued', ?5, 0, ?6, ?6, ?6)",
      params![id, skill_id, job_type, input_ref, priority, now],
    )?;

        Ok(id)
    }

    pub fn run_pending_jobs(&self, limit: u32) -> Result<JobRunReport> {
        let conn = self.conn()?;
        let mut report = JobRunReport {
            processed: 0,
            succeeded: 0,
            failed: 0,
        };

        for _ in 0..limit {
            let Some(job) = self.fetch_next_job(&conn)? else {
                break;
            };

            report.processed += 1;
            let now = now_rfc3339();
            conn.execute(
                "UPDATE jobs SET state = 'running', started_at = ?1, updated_at = ?1 WHERE id = ?2",
                params![now, job.id],
            )?;

            let job_result = self.execute_job(&conn, &job);

            match job_result {
                Ok(_) => {
                    let done_at = now_rfc3339();
                    conn.execute(
                        "UPDATE jobs
             SET state = 'success', finished_at = ?1, updated_at = ?1, error = NULL
             WHERE id = ?2",
                        params![done_at, job.id],
                    )?;
                    report.succeeded += 1;
                }
                Err(error) => {
                    let next_attempt = job.attempts + 1;
                    if next_attempt >= 3 {
                        conn.execute(
                            "UPDATE jobs
               SET state = 'failed', attempts = ?1, error = ?2, finished_at = ?3, updated_at = ?3
               WHERE id = ?4",
                            params![next_attempt, error.to_string(), now_rfc3339(), job.id],
                        )?;
                        report.failed += 1;
                    } else {
                        let retry_at = (Utc::now() + Duration::minutes(5)).to_rfc3339();
                        conn.execute(
                            "UPDATE jobs
               SET state = 'retrying', attempts = ?1, error = ?2, scheduled_at = ?3, updated_at = ?4
               WHERE id = ?5",
                            params![
                                next_attempt,
                                error.to_string(),
                                retry_at,
                                now_rfc3339(),
                                job.id
                            ],
                        )?;
                    }
                }
            }
        }

        Ok(report)
    }

    fn fetch_next_job(&self, conn: &Connection) -> Result<Option<QueuedJob>> {
        let now = now_rfc3339();

        let job = conn
            .query_row(
                "SELECT id, skill_id, job_type, input_ref, attempts
         FROM jobs
         WHERE state IN ('queued', 'retrying')
           AND (scheduled_at IS NULL OR scheduled_at <= ?1)
         ORDER BY priority DESC, created_at ASC
         LIMIT 1",
                params![now],
                |row| {
                    Ok(QueuedJob {
                        id: row.get(0)?,
                        skill_id: row.get(1)?,
                        job_type: row.get(2)?,
                        input_ref: row.get(3)?,
                        attempts: row.get(4)?,
                    })
                },
            )
            .optional()?;

        Ok(job)
    }

    fn execute_job(&self, conn: &Connection, job: &QueuedJob) -> Result<()> {
        let job_type = normalize_job_type(&job.job_type);

        match job_type.as_str() {
            "summarize" => {
                let inbox_id = job
                    .input_ref
                    .as_deref()
                    .ok_or_else(|| anyhow!("summarize job missing input_ref"))?;
                self.job_summarize(conn, inbox_id)?;
            }
            "extract_tasks" => {
                let inbox_id = job
                    .input_ref
                    .as_deref()
                    .ok_or_else(|| anyhow!("extract_tasks job missing input_ref"))?;
                self.job_extract_tasks(conn, &job.id, inbox_id)?;
            }
            "tag" => {
                let inbox_id = job
                    .input_ref
                    .as_deref()
                    .ok_or_else(|| anyhow!("tag job missing input_ref"))?;
                self.job_tag(conn, inbox_id)?;
            }
            "plan_daily" => {
                let _ = self.generate_daily_plan(conn)?;
            }
            "plan_weekly" => {
                let _ = self.generate_weekly_plan(conn)?;
            }
            "spaced_review_select" => {
                self.job_spaced_review_select(conn)?;
            }
            "project_health_update" => {
                self.job_project_health_update(conn)?;
            }
            "stats_rollup" => {
                self.job_stats_rollup(conn)?;
            }
            "aggregate" => {
                self.job_stats_rollup(conn)?;
            }
            other => {
                bail!("unsupported job type `{other}`")
            }
        }

        if let Some(skill_id) = &job.skill_id {
            self.insert_event(
                conn,
                "job.completed",
                "job",
                Some(&job.id),
                &json!({ "skill_id": skill_id, "job_type": job_type }),
            )?;
        }

        Ok(())
    }

    fn job_summarize(&self, conn: &Connection, inbox_id: &str) -> Result<()> {
        let item = conn
            .query_row(
                "SELECT source, content_text, created_at FROM inbox_items WHERE id = ?1",
                params![inbox_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;

        let (source, content_text, created_at) =
            item.ok_or_else(|| anyhow!("inbox item `{inbox_id}` not found"))?;

        let summary = summarize_text(&content_text);
        let date = Utc::now().date_naive().format("%Y-%m-%d").to_string();
        let path = format!("Inbox/Processed/{date}/{inbox_id}.md");

        let markdown = format!(
      "# Captured from {source}\n\n## Summary\n{summary}\n\n## Source Timestamp\n- Captured at: {created_at}\n\n## Raw\n```text\n{content_text}\n```\n"
    );

        let saved = self.vault_save_note(&path, &markdown)?;

        conn.execute(
            "UPDATE inbox_items SET status = 'processed', updated_at = ?1 WHERE id = ?2",
            params![now_rfc3339(), inbox_id],
        )?;

        self.insert_event(
            conn,
            "inbox.summarized",
            "inbox_item",
            Some(inbox_id),
            &json!({ "note_id": saved.id, "note_path": path }),
        )?;

        Ok(())
    }

    fn job_extract_tasks(&self, conn: &Connection, job_id: &str, inbox_id: &str) -> Result<()> {
        let item = conn
            .query_row(
                "SELECT content_text, project_hint FROM inbox_items WHERE id = ?1",
                params![inbox_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
            )
            .optional()?;

        let (content_text, project_hint) =
            item.ok_or_else(|| anyhow!("inbox item `{inbox_id}` not found"))?;
        let project_id = self.resolve_project_id(conn, project_hint.as_deref())?;

        let task_candidates = extract_task_candidates(&content_text);
        let now = now_rfc3339();

        for task_title in task_candidates.iter().take(5) {
            let energy = if task_title.len() <= 42 {
                "low"
            } else {
                "medium"
            };
            conn.execute(
        "INSERT INTO tasks (id, title, note_id, project_id, due_at, energy, status, source_job_id, created_at, updated_at)
         VALUES (?1, ?2, NULL, ?3, NULL, ?4, 'todo', ?5, ?6, ?6)",
        params![Uuid::new_v4().to_string(), task_title, project_id, energy, job_id, now],
      )?;
        }

        self.insert_event(
            conn,
            "tasks.extracted",
            "inbox_item",
            Some(inbox_id),
            &json!({ "count": task_candidates.len().min(5) }),
        )?;

        Ok(())
    }

    fn job_tag(&self, conn: &Connection, inbox_id: &str) -> Result<()> {
        let item = conn
            .query_row(
                "SELECT content_text, tags_json FROM inbox_items WHERE id = ?1",
                params![inbox_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;

        let (content_text, tags_json) =
            item.ok_or_else(|| anyhow!("inbox item `{inbox_id}` not found"))?;

        let mut tags = crate::core::utils::parse_tags_json(&tags_json)
            .into_iter()
            .map(|tag| tag.to_lowercase())
            .collect::<BTreeSet<_>>();

        let content_lower = content_text.to_lowercase();
        let rules = [
            ("meeting", "communication"),
            ("call", "communication"),
            ("созвон", "communication"),
            ("bug", "maintenance"),
            ("fix", "maintenance"),
            ("ошиб", "maintenance"),
            ("learn", "learning"),
            ("study", "learning"),
            ("idea", "idea"),
            ("plan", "planning"),
            ("деньги", "money"),
            ("mood", "mood"),
        ];

        for (needle, tag) in rules {
            if content_lower.contains(needle) {
                tags.insert(tag.to_string());
            }
        }

        let tags_sorted = tags.into_iter().collect::<Vec<_>>();
        conn.execute(
            "UPDATE inbox_items SET tags_json = ?1, updated_at = ?2 WHERE id = ?3",
            params![
                serde_json::to_string(&tags_sorted)?,
                now_rfc3339(),
                inbox_id
            ],
        )?;

        self.insert_event(
            conn,
            "inbox.tagged",
            "inbox_item",
            Some(inbox_id),
            &json!({ "tags": tags_sorted }),
        )?;

        Ok(())
    }

    fn job_spaced_review_select(&self, conn: &Connection) -> Result<()> {
        let due_reviews = self.select_due_reviews(conn, 8)?;
        if due_reviews.is_empty() {
            return Ok(());
        }

        let today = Utc::now().date_naive().format("%Y-%m-%d").to_string();
        let path = format!("Daily/{today}.md");
        let section_title = format!("## Recall / Review ({today})");

        let mut lines = Vec::new();
        for review in due_reviews {
            lines.push(format!(
                "- [ ] [[{}|{}]] (due {})",
                review.path, review.title, review.due_at
            ));
        }

        self.append_section(&path, &section_title, &lines.join("\n"))?;

        self.insert_event(
            conn,
            "review.block_generated",
            "note",
            None,
            &json!({ "path": path }),
        )?;

        Ok(())
    }

    fn job_project_health_update(&self, conn: &Connection) -> Result<()> {
        let mut stmt = conn.prepare("SELECT id FROM projects ORDER BY id")?;
        let project_ids = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for project_id in project_ids {
            let open_tasks: i64 = conn.query_row(
                "SELECT COUNT(*) FROM tasks WHERE project_id = ?1 AND status != 'done'",
                params![project_id],
                |row| row.get(0),
            )?;
            let done_tasks: i64 = conn.query_row(
                "SELECT COUNT(*) FROM tasks WHERE project_id = ?1 AND status = 'done'",
                params![project_id],
                |row| row.get(0),
            )?;
            let focus_minutes: i64 = conn.query_row(
        "SELECT COALESCE(SUM(duration_sec), 0) / 60 FROM focus_sessions WHERE project_id = ?1",
        params![project_id],
        |row| row.get(0),
      )?;

            let xp = done_tasks * 20 + focus_minutes;
            let level = (xp / 500) + 1;
            let mut health = 50.0 + (done_tasks as f64 * 3.0) + (focus_minutes as f64 * 0.2);
            health -= open_tasks as f64 * 1.8;
            health = health.clamp(0.0, 100.0);

            conn.execute(
        "UPDATE projects SET health = ?1, xp = ?2, level = ?3, updated_at = ?4 WHERE id = ?5",
        params![health, xp, level, now_rfc3339(), project_id],
      )?;
        }

        Ok(())
    }

    fn job_stats_rollup(&self, conn: &Connection) -> Result<()> {
        let today = Utc::now().date_naive().format("%Y-%m-%d").to_string();

        let note_count: i64 = conn.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))?;
        let inbox_new: i64 = conn.query_row(
            "SELECT COUNT(*) FROM inbox_items WHERE status IN ('new', 'queued')",
            [],
            |row| row.get(0),
        )?;
        let focus_minutes: i64 = conn.query_row(
      "SELECT COALESCE(SUM(duration_sec), 0) / 60 FROM focus_sessions WHERE started_at LIKE ?1",
      params![format!("{today}%")],
      |row| row.get(0),
    )?;
        let jobs_queued: i64 = conn.query_row(
            "SELECT COUNT(*) FROM jobs WHERE state IN ('queued', 'retrying', 'running')",
            [],
            |row| row.get(0),
        )?;

        upsert_metric(conn, &today, "notes.count", note_count as f64)?;
        upsert_metric(conn, &today, "inbox.new", inbox_new as f64)?;
        upsert_metric(conn, &today, "focus.minutes", focus_minutes as f64)?;
        upsert_metric(conn, &today, "jobs.queued", jobs_queued as f64)?;

        self.insert_event(
            conn,
            "metrics.rolled_up",
            "metrics_daily",
            None,
            &json!({ "date": today }),
        )?;

        Ok(())
    }
}
