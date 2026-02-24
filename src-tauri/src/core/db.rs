use anyhow::Result;
use rusqlite::{params, Connection};

pub const DEFAULT_PROJECT_ID: &str = "project_general";

pub const BUILTIN_SKILLS: &[(&str, &str)] = &[
    (
        "daily_planner",
        include_str!("../../skills/daily_planner.yaml"),
    ),
    (
        "spaced_review",
        include_str!("../../skills/spaced_review.yaml"),
    ),
    (
        "mood_money_events_summary",
        include_str!("../../skills/mood_money_events_summary.yaml"),
    ),
];

pub fn init_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(include_str!("../../migrations/001_init.sql"))?;
    conn.execute_batch(include_str!("../../migrations/002_telegram.sql"))?;
    conn.execute_batch(include_str!(
        "../../migrations/003_trash_and_index_state.sql"
    ))?;
    ensure_focus_pause_columns(conn)?;
    conn.execute_batch(include_str!("../../migrations/004_focus_pause_resume.sql"))?;
    conn.execute_batch(include_str!("../../migrations/005_flashcards.sql"))?;
    conn.execute_batch(include_str!("../../migrations/006_projects_perf.sql"))?;
    Ok(())
}

pub fn upsert_metric(conn: &Connection, date: &str, key: &str, value: f64) -> Result<()> {
    conn.execute(
        "INSERT INTO metrics_daily (date, metric_key, metric_value)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(date, metric_key) DO UPDATE SET metric_value = excluded.metric_value",
        params![date, key, value],
    )?;

    Ok(())
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn ensure_focus_pause_columns(conn: &Connection) -> Result<()> {
    if !table_has_column(conn, "focus_sessions", "paused_at")? {
        conn.execute("ALTER TABLE focus_sessions ADD COLUMN paused_at TEXT", [])?;
    }

    if !table_has_column(conn, "focus_sessions", "paused_total_sec")? {
        conn.execute(
            "ALTER TABLE focus_sessions ADD COLUMN paused_total_sec INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    Ok(())
}
