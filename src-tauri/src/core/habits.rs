use anyhow::{anyhow, bail, Result};
use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::core::{
    state::AppState,
    types::{HabitFrequency, HabitLogView, HabitTodayItem, HabitTodayPage, HabitView},
    utils::now_rfc3339,
};

const FREQUENCY_DAILY: &str = "daily";
const FREQUENCY_WEEKDAYS: &str = "weekdays";
const FREQUENCY_CUSTOM_WEEKDAYS: &str = "custom_weekdays";
const FREQUENCY_EVERY_N_DAYS: &str = "every_n_days";

#[derive(Debug, Clone)]
struct HabitRow {
    id: String,
    slug: String,
    title: String,
    description: String,
    frequency_type: String,
    frequency_value_json: String,
    project_id: Option<String>,
    archived: bool,
    created_at: String,
    updated_at: String,
}

fn default_log_date() -> String {
    Utc::now().date_naive().format("%Y-%m-%d").to_string()
}

fn normalize_date_input(raw: Option<String>) -> Result<String> {
    let date = match raw {
        Some(value) => value.trim().to_string(),
        None => default_log_date(),
    };
    if date.is_empty() {
        bail!("date cannot be empty");
    }
    NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| anyhow!("invalid date `{date}`, expected YYYY-MM-DD"))?;
    Ok(date)
}

fn normalize_frequency_type(value: Option<&str>) -> Result<String> {
    let normalized = value
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .unwrap_or(FREQUENCY_DAILY)
        .to_ascii_lowercase();
    match normalized.as_str() {
        FREQUENCY_DAILY | FREQUENCY_WEEKDAYS | FREQUENCY_CUSTOM_WEEKDAYS | FREQUENCY_EVERY_N_DAYS => {
            Ok(normalized)
        }
        _ => bail!("invalid habit frequency type `{normalized}`"),
    }
}

fn normalize_weekdays(input: Option<Vec<u8>>) -> Result<Vec<u8>> {
    let mut weekdays = input.unwrap_or_default();
    weekdays.sort_unstable();
    weekdays.dedup();
    if weekdays.is_empty() {
        bail!("custom_weekdays requires at least one weekday");
    }
    if weekdays.iter().any(|day| *day < 1 || *day > 7) {
        bail!("weekday values must be in range 1..7");
    }
    Ok(weekdays)
}

fn normalize_interval_days(input: Option<u32>) -> Result<u32> {
    let value = input.unwrap_or(0);
    if value < 2 {
        bail!("every_n_days requires interval_days >= 2");
    }
    Ok(value)
}

fn build_frequency(
    frequency_type: &str,
    weekdays: Option<Vec<u8>>,
    interval_days: Option<u32>,
) -> Result<HabitFrequency> {
    match frequency_type {
        FREQUENCY_DAILY | FREQUENCY_WEEKDAYS => Ok(HabitFrequency {
            frequency_type: frequency_type.to_string(),
            weekdays: None,
            interval_days: None,
        }),
        FREQUENCY_CUSTOM_WEEKDAYS => Ok(HabitFrequency {
            frequency_type: frequency_type.to_string(),
            weekdays: Some(normalize_weekdays(weekdays)?),
            interval_days: None,
        }),
        FREQUENCY_EVERY_N_DAYS => Ok(HabitFrequency {
            frequency_type: frequency_type.to_string(),
            weekdays: None,
            interval_days: Some(normalize_interval_days(interval_days)?),
        }),
        other => bail!("invalid habit frequency type `{other}`"),
    }
}

fn frequency_to_json(frequency: &HabitFrequency) -> String {
    match frequency.frequency_type.as_str() {
        FREQUENCY_CUSTOM_WEEKDAYS => {
            json!({ "weekdays": frequency.weekdays.clone().unwrap_or_default() }).to_string()
        }
        FREQUENCY_EVERY_N_DAYS => {
            json!({ "interval_days": frequency.interval_days.unwrap_or(2) }).to_string()
        }
        _ => json!({}).to_string(),
    }
}

fn parse_frequency(frequency_type: &str, frequency_value_json: &str) -> Result<HabitFrequency> {
    let value = serde_json::from_str::<Value>(frequency_value_json).unwrap_or_else(|_| json!({}));
    match frequency_type {
        FREQUENCY_DAILY | FREQUENCY_WEEKDAYS => Ok(HabitFrequency {
            frequency_type: frequency_type.to_string(),
            weekdays: None,
            interval_days: None,
        }),
        FREQUENCY_CUSTOM_WEEKDAYS => {
            let raw_weekdays = value
                .get("weekdays")
                .and_then(Value::as_array)
                .map(|days| {
                    days.iter()
                        .filter_map(|day| day.as_u64())
                        .filter_map(|day| u8::try_from(day).ok())
                        .collect::<Vec<_>>()
                });
            let weekdays = normalize_weekdays(raw_weekdays)?;
            Ok(HabitFrequency {
                frequency_type: frequency_type.to_string(),
                weekdays: Some(weekdays),
                interval_days: None,
            })
        }
        FREQUENCY_EVERY_N_DAYS => {
            let raw_interval = value
                .get("interval_days")
                .and_then(Value::as_u64)
                .and_then(|interval| u32::try_from(interval).ok());
            let interval_days = normalize_interval_days(raw_interval)?;
            Ok(HabitFrequency {
                frequency_type: frequency_type.to_string(),
                weekdays: None,
                interval_days: Some(interval_days),
            })
        }
        other => bail!("invalid habit frequency type `{other}`"),
    }
}

fn slug_from_title(title: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in title.to_ascii_lowercase().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            prev_dash = false;
            continue;
        }
        if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }
    let normalized = slug.trim_matches('-').to_string();
    if normalized.is_empty() {
        "habit".to_string()
    } else {
        normalized
    }
}

fn unique_habit_slug(conn: &Connection, title: &str) -> Result<String> {
    let base = slug_from_title(title);
    let mut candidate = base.clone();
    let mut seq = 2_u32;
    loop {
        let exists = conn
            .query_row(
                "SELECT 1 FROM habits WHERE slug = ?1 LIMIT 1",
                params![candidate.clone()],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !exists {
            return Ok(candidate);
        }
        candidate = format!("{base}-{seq}");
        seq += 1;
    }
}

fn normalize_title(value: &str) -> Result<String> {
    let title = value.trim();
    if title.is_empty() {
        bail!("habit title cannot be empty");
    }
    Ok(title.to_string())
}

fn map_habit_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<HabitRow> {
    Ok(HabitRow {
        id: row.get(0)?,
        slug: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        frequency_type: row.get(4)?,
        frequency_value_json: row.get(5)?,
        project_id: row.get(6)?,
        archived: row.get::<_, i64>(7)? != 0,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn habit_row_to_view(row: HabitRow) -> Result<HabitView> {
    let frequency = parse_frequency(&row.frequency_type, &row.frequency_value_json)?;
    Ok(HabitView {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        frequency,
        project_id: row.project_id,
        archived: row.archived,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn resolve_existing_project_id(conn: &Connection, project_ref: &str) -> Result<String> {
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

fn habit_row_by_id(conn: &Connection, habit_id: &str) -> Result<HabitRow> {
    conn.query_row(
        "SELECT id, slug, title, description, frequency_type, frequency_value_json, project_id, archived, created_at, updated_at
         FROM habits
         WHERE id = ?1
         LIMIT 1",
        params![habit_id],
        map_habit_row,
    )
    .optional()?
    .ok_or_else(|| anyhow!("habit `{habit_id}` not found"))
}

fn habit_due_on(habit: &HabitView, date: NaiveDate) -> bool {
    let weekday = u8::try_from(date.weekday().number_from_monday()).unwrap_or(1);
    match habit.frequency.frequency_type.as_str() {
        FREQUENCY_DAILY => true,
        FREQUENCY_WEEKDAYS => weekday <= 5,
        FREQUENCY_CUSTOM_WEEKDAYS => habit
            .frequency
            .weekdays
            .as_ref()
            .map(|days| days.contains(&weekday))
            .unwrap_or(false),
        FREQUENCY_EVERY_N_DAYS => {
            let Some(interval_days) = habit.frequency.interval_days else {
                return false;
            };
            let anchor_date = DateTime::parse_from_rfc3339(&habit.created_at)
                .map(|value| value.date_naive())
                .unwrap_or(date);
            let delta = (date - anchor_date).num_days();
            delta >= 0 && delta % i64::from(interval_days) == 0
        }
        _ => false,
    }
}

fn habit_completed_on(conn: &Connection, habit_id: &str, date: NaiveDate) -> Result<bool> {
    let date_raw = date.format("%Y-%m-%d").to_string();
    let completed = conn
        .query_row(
            "SELECT 1 FROM habit_logs WHERE habit_id = ?1 AND log_date = ?2 AND done = 1 LIMIT 1",
            params![habit_id, date_raw],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    Ok(completed)
}

fn habit_current_streak(conn: &Connection, habit: &HabitView, today: NaiveDate) -> Result<i64> {
    let mut streak = 0_i64;
    let mut cursor = today;
    let lower_bound = today - Duration::days(3650);
    loop {
        if cursor < lower_bound {
            break;
        }
        if habit_due_on(habit, cursor) {
            if habit_completed_on(conn, &habit.id, cursor)? {
                streak += 1;
            } else {
                break;
            }
        }
        cursor -= Duration::days(1);
    }
    Ok(streak)
}

impl AppState {
    pub fn habits_list(
        &self,
        include_archived: Option<bool>,
        project_id: Option<String>,
    ) -> Result<Vec<HabitView>> {
        let conn = self.conn()?;
        let include_archived = include_archived.unwrap_or(false);
        let project_filter = match project_id.as_deref() {
            Some(value) if !value.trim().is_empty() => Some(resolve_existing_project_id(&conn, value)?),
            _ => None,
        };

        let rows = if include_archived {
            if let Some(project_id) = project_filter {
                let mut stmt = conn.prepare(
                    "SELECT id, slug, title, description, frequency_type, frequency_value_json, project_id, archived, created_at, updated_at
                     FROM habits
                     WHERE project_id = ?1
                     ORDER BY archived ASC, updated_at DESC, title ASC",
                )?;
                let mapped = stmt.query_map(params![project_id], map_habit_row)?;
                let rows = mapped.collect::<rusqlite::Result<Vec<_>>>()?;
                rows
            } else {
                let mut stmt = conn.prepare(
                    "SELECT id, slug, title, description, frequency_type, frequency_value_json, project_id, archived, created_at, updated_at
                     FROM habits
                     ORDER BY archived ASC, updated_at DESC, title ASC",
                )?;
                let mapped = stmt.query_map([], map_habit_row)?;
                let rows = mapped.collect::<rusqlite::Result<Vec<_>>>()?;
                rows
            }
        } else if let Some(project_id) = project_filter {
            let mut stmt = conn.prepare(
                "SELECT id, slug, title, description, frequency_type, frequency_value_json, project_id, archived, created_at, updated_at
                 FROM habits
                 WHERE archived = 0 AND project_id = ?1
                 ORDER BY updated_at DESC, title ASC",
            )?;
            let mapped = stmt.query_map(params![project_id], map_habit_row)?;
            let rows = mapped.collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, slug, title, description, frequency_type, frequency_value_json, project_id, archived, created_at, updated_at
                 FROM habits
                 WHERE archived = 0
                 ORDER BY updated_at DESC, title ASC",
            )?;
            let mapped = stmt.query_map([], map_habit_row)?;
            let rows = mapped.collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };

        rows.into_iter().map(habit_row_to_view).collect()
    }

    pub fn habits_create(
        &self,
        title: String,
        description: Option<String>,
        frequency_type: Option<String>,
        weekdays: Option<Vec<u8>>,
        interval_days: Option<u32>,
        project_id: Option<String>,
    ) -> Result<HabitView> {
        let conn = self.conn()?;
        let normalized_title = normalize_title(&title)?;
        let normalized_description = description.unwrap_or_default().trim().to_string();
        let normalized_frequency_type = normalize_frequency_type(frequency_type.as_deref())?;
        let frequency = build_frequency(&normalized_frequency_type, weekdays, interval_days)?;
        let frequency_value_json = frequency_to_json(&frequency);
        let resolved_project_id = match project_id {
            Some(value) if !value.trim().is_empty() => Some(resolve_existing_project_id(&conn, &value)?),
            _ => None,
        };

        let habit_id = Uuid::new_v4().to_string();
        let slug = unique_habit_slug(&conn, &normalized_title)?;
        let now = now_rfc3339();
        conn.execute(
            "INSERT INTO habits (
                id, slug, title, description, frequency_type, frequency_value_json, project_id, archived, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?8)",
            params![
                habit_id,
                slug,
                normalized_title,
                normalized_description,
                normalized_frequency_type,
                frequency_value_json,
                resolved_project_id,
                now,
            ],
        )?;

        let row = habit_row_by_id(&conn, &habit_id)?;
        habit_row_to_view(row)
    }

    pub fn habits_update(
        &self,
        habit_id: String,
        title: Option<String>,
        description: Option<String>,
        frequency_type: Option<String>,
        weekdays: Option<Vec<u8>>,
        interval_days: Option<u32>,
        project_id: Option<String>,
    ) -> Result<HabitView> {
        let conn = self.conn()?;
        let current = habit_row_by_id(&conn, &habit_id)?;
        let current_frequency = parse_frequency(&current.frequency_type, &current.frequency_value_json)?;

        let next_title = match title {
            Some(value) => normalize_title(&value)?,
            None => current.title.clone(),
        };
        let next_description = match description {
            Some(value) => value.trim().to_string(),
            None => current.description.clone(),
        };
        let next_frequency_type = normalize_frequency_type(
            frequency_type
                .as_deref()
                .or(Some(current_frequency.frequency_type.as_str())),
        )?;
        let next_weekdays = if weekdays.is_some() {
            weekdays
        } else {
            current_frequency.weekdays.clone()
        };
        let next_interval_days = if interval_days.is_some() {
            interval_days
        } else {
            current_frequency.interval_days
        };
        let next_frequency = build_frequency(&next_frequency_type, next_weekdays, next_interval_days)?;
        let next_frequency_json = frequency_to_json(&next_frequency);
        let next_project_id = match project_id {
            None => current.project_id.clone(),
            Some(value) if value.trim().is_empty() => None,
            Some(value) => Some(resolve_existing_project_id(&conn, &value)?),
        };

        conn.execute(
            "UPDATE habits
             SET title = ?1,
                 description = ?2,
                 frequency_type = ?3,
                 frequency_value_json = ?4,
                 project_id = ?5,
                 updated_at = ?6
             WHERE id = ?7",
            params![
                next_title,
                next_description,
                next_frequency_type,
                next_frequency_json,
                next_project_id,
                now_rfc3339(),
                habit_id,
            ],
        )?;

        let row = habit_row_by_id(&conn, &habit_id)?;
        habit_row_to_view(row)
    }

    pub fn habits_archive(&self, habit_id: String, archived: bool) -> Result<HabitView> {
        let conn = self.conn()?;
        let changed = conn.execute(
            "UPDATE habits SET archived = ?1, updated_at = ?2 WHERE id = ?3",
            params![if archived { 1 } else { 0 }, now_rfc3339(), habit_id],
        )?;
        if changed == 0 {
            bail!("habit `{habit_id}` not found");
        }
        let row = habit_row_by_id(&conn, &habit_id)?;
        habit_row_to_view(row)
    }

    pub fn habits_delete(&self, habit_id: String) -> Result<()> {
        let conn = self.conn()?;
        let changed = conn.execute("DELETE FROM habits WHERE id = ?1", params![habit_id.clone()])?;
        if changed == 0 {
            bail!("habit `{habit_id}` not found");
        }
        Ok(())
    }

    pub fn habits_mark_done(
        &self,
        habit_id: String,
        date: Option<String>,
    ) -> Result<HabitLogView> {
        let conn = self.conn()?;
        let _ = habit_row_by_id(&conn, &habit_id)?;
        let log_date = normalize_date_input(date)?;
        let now = now_rfc3339();

        let existing = conn
            .query_row(
                "SELECT id, created_at FROM habit_logs WHERE habit_id = ?1 AND log_date = ?2 LIMIT 1",
                params![habit_id.clone(), log_date.clone()],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;

        let (log_id, created_at) = if let Some((id, created_at)) = existing {
            conn.execute(
                "UPDATE habit_logs SET done = 1, updated_at = ?1 WHERE id = ?2",
                params![now, id.clone()],
            )?;
            (id, created_at)
        } else {
            let id = Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO habit_logs (id, habit_id, log_date, done, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 1, ?4, ?4)",
                params![id.clone(), habit_id.clone(), log_date.clone(), now.clone()],
            )?;
            (id, now.clone())
        };

        Ok(HabitLogView {
            id: log_id,
            habit_id,
            log_date,
            done: true,
            created_at,
            updated_at: now,
        })
    }

    pub fn habits_unmark_done(&self, habit_id: String, date: Option<String>) -> Result<()> {
        let conn = self.conn()?;
        let _ = habit_row_by_id(&conn, &habit_id)?;
        let log_date = normalize_date_input(date)?;
        conn.execute(
            "DELETE FROM habit_logs WHERE habit_id = ?1 AND log_date = ?2",
            params![habit_id, log_date],
        )?;
        Ok(())
    }

    pub fn habits_today(
        &self,
        date: Option<String>,
        include_archived: Option<bool>,
    ) -> Result<HabitTodayPage> {
        let conn = self.conn()?;
        let date_raw = normalize_date_input(date)?;
        let date = NaiveDate::parse_from_str(&date_raw, "%Y-%m-%d")
            .map_err(|_| anyhow!("invalid date `{date_raw}`"))?;
        let habits = self.habits_list(include_archived, None)?;

        let mut items = Vec::with_capacity(habits.len());
        for habit in habits {
            let is_due_today = habit_due_on(&habit, date);
            let completed_today = habit_completed_on(&conn, &habit.id, date)?;
            let current_streak = habit_current_streak(&conn, &habit, date)?;
            items.push(HabitTodayItem {
                habit,
                is_due_today,
                completed_today,
                current_streak,
            });
        }

        Ok(HabitTodayPage {
            date: date_raw,
            total: i64::try_from(items.len()).unwrap_or(0),
            items,
        })
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use rusqlite::params;
    use tempfile::tempdir;

    use crate::core::state::AppState;

    #[test]
    fn habits_create_and_list() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let created = state.habits_create(
            "Morning walk".to_string(),
            Some("20 min".to_string()),
            Some("daily".to_string()),
            None,
            None,
            Some("project_life".to_string()),
        )?;
        assert_eq!(created.title, "Morning walk");
        assert_eq!(created.project_id.as_deref(), Some("project_life"));
        assert_eq!(created.frequency.frequency_type, "daily");

        let listed = state.habits_list(None, None)?;
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, created.id);
        Ok(())
    }

    #[test]
    fn habits_update_and_archive() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        let created = state.habits_create(
            "Read".to_string(),
            None,
            Some("weekdays".to_string()),
            None,
            None,
            None,
        )?;

        let updated = state.habits_update(
            created.id.clone(),
            Some("Read 30m".to_string()),
            Some("".to_string()),
            Some("every_n_days".to_string()),
            None,
            Some(3),
            Some("".to_string()),
        )?;
        assert_eq!(updated.title, "Read 30m");
        assert_eq!(updated.frequency.frequency_type, "every_n_days");
        assert_eq!(updated.frequency.interval_days, Some(3));
        assert!(updated.project_id.is_none());

        let archived = state.habits_archive(created.id.clone(), true)?;
        assert!(archived.archived);
        let active = state.habits_list(None, None)?;
        assert!(active.is_empty());
        let with_archived = state.habits_list(Some(true), None)?;
        assert_eq!(with_archived.len(), 1);
        Ok(())
    }

    #[test]
    fn habits_mark_done_unique_per_day() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        let created = state.habits_create(
            "Journal".to_string(),
            None,
            Some("daily".to_string()),
            None,
            None,
            None,
        )?;

        let first = state.habits_mark_done(created.id.clone(), Some("2026-03-02".to_string()))?;
        let second = state.habits_mark_done(created.id.clone(), Some("2026-03-02".to_string()))?;
        assert_eq!(first.id, second.id);

        let conn = state.conn()?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM habit_logs WHERE habit_id = ?1 AND log_date = '2026-03-02'",
            params![created.id],
            |row| row.get(0),
        )?;
        assert_eq!(count, 1);
        Ok(())
    }

    #[test]
    fn habits_today_due_logic_weekdays_custom_every_n() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        let weekdays = state.habits_create(
            "Weekdays".to_string(),
            None,
            Some("weekdays".to_string()),
            None,
            None,
            None,
        )?;
        let custom = state.habits_create(
            "Custom".to_string(),
            None,
            Some("custom_weekdays".to_string()),
            Some(vec![1, 3, 5]),
            None,
            None,
        )?;
        let every = state.habits_create(
            "Every".to_string(),
            None,
            Some("every_n_days".to_string()),
            None,
            Some(2),
            None,
        )?;

        let conn = state.conn()?;
        conn.execute(
            "UPDATE habits SET created_at = '2026-03-01T00:00:00Z', updated_at = '2026-03-01T00:00:00Z' WHERE id = ?1",
            params![every.id],
        )?;

        let monday = state.habits_today(Some("2026-03-02".to_string()), None)?;
        let monday_weekdays = monday
            .items
            .iter()
            .find(|item| item.habit.id == weekdays.id)
            .expect("weekdays habit");
        let monday_custom = monday
            .items
            .iter()
            .find(|item| item.habit.id == custom.id)
            .expect("custom habit");
        let monday_every = monday
            .items
            .iter()
            .find(|item| item.habit.id == every.id)
            .expect("every habit");
        assert!(monday_weekdays.is_due_today);
        assert!(monday_custom.is_due_today);
        assert!(!monday_every.is_due_today);

        let tuesday = state.habits_today(Some("2026-03-03".to_string()), None)?;
        let tuesday_custom = tuesday
            .items
            .iter()
            .find(|item| item.habit.id == custom.id)
            .expect("custom habit");
        let tuesday_every = tuesday
            .items
            .iter()
            .find(|item| item.habit.id == every.id)
            .expect("every habit");
        assert!(!tuesday_custom.is_due_today);
        assert!(tuesday_every.is_due_today);
        Ok(())
    }

    #[test]
    fn habits_streak_counts_only_due_days() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        let created = state.habits_create(
            "Journal".to_string(),
            None,
            Some("daily".to_string()),
            None,
            None,
            None,
        )?;
        state.habits_mark_done(created.id.clone(), Some("2026-03-01".to_string()))?;
        state.habits_mark_done(created.id.clone(), Some("2026-03-02".to_string()))?;
        state.habits_mark_done(created.id.clone(), Some("2026-03-03".to_string()))?;

        let today = state.habits_today(Some("2026-03-03".to_string()), None)?;
        let item = today
            .items
            .iter()
            .find(|candidate| candidate.habit.id == created.id)
            .expect("habit exists");
        assert_eq!(item.current_streak, 3);

        state.habits_unmark_done(created.id.clone(), Some("2026-03-03".to_string()))?;
        let after_unmark = state.habits_today(Some("2026-03-03".to_string()), None)?;
        let after_unmark_item = after_unmark
            .items
            .iter()
            .find(|candidate| candidate.habit.id == created.id)
            .expect("habit exists");
        assert_eq!(after_unmark_item.current_streak, 0);
        Ok(())
    }

    #[test]
    fn habits_delete_cascades_logs() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;
        let created = state.habits_create(
            "Delete me".to_string(),
            None,
            Some("daily".to_string()),
            None,
            None,
            None,
        )?;
        state.habits_mark_done(created.id.clone(), Some("2026-03-02".to_string()))?;

        state.habits_delete(created.id.clone())?;

        let conn = state.conn()?;
        let logs_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM habit_logs WHERE habit_id = ?1",
            params![created.id],
            |row| row.get(0),
        )?;
        assert_eq!(logs_count, 0);
        Ok(())
    }
}
