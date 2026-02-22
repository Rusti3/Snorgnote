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
