use std::collections::BTreeMap;

use core_domain::{DomainEvent, Timestamp};

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DailyMetrics {
    pub day_key: String,
    pub inbox_in: u32,
    pub inbox_done: u32,
    pub notes_created: u32,
    pub tasks_extracted: u32,
    pub focus_minutes: u32,
    pub reviews_scheduled: u32,
    pub reviews_completed: u32,
}

#[derive(Debug, Default)]
pub struct MetricsEngine {
    daily: BTreeMap<String, DailyMetrics>,
}

impl MetricsEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn ingest(&mut self, timestamp: Timestamp, event: &DomainEvent) {
        let day_key = ymd_key(timestamp);
        let row = self
            .daily
            .entry(day_key.clone())
            .or_insert_with(|| DailyMetrics {
                day_key,
                ..DailyMetrics::default()
            });
        match event {
            DomainEvent::InboxItemCaptured { .. } => row.inbox_in += 1,
            DomainEvent::InboxItemProcessed { .. } => row.inbox_done += 1,
            DomainEvent::NoteUpserted { .. } => row.notes_created += 1,
            DomainEvent::TaskExtracted { .. } => row.tasks_extracted += 1,
            DomainEvent::FocusSessionLogged { minutes, .. } => row.focus_minutes += *minutes,
            DomainEvent::ReviewScheduled { .. } => row.reviews_scheduled += 1,
            DomainEvent::ReviewCompleted { .. } => row.reviews_completed += 1,
            DomainEvent::JobEnqueued { .. }
            | DomainEvent::JobCompleted { .. }
            | DomainEvent::JobFailed { .. } => {}
        }
    }

    pub fn get_day(&self, day_key: &str) -> Option<&DailyMetrics> {
        self.daily.get(day_key)
    }

    pub fn all_days(&self) -> Vec<&DailyMetrics> {
        self.daily.values().collect()
    }

    pub fn range(&self, from: &str, to: &str) -> Vec<&DailyMetrics> {
        self.daily
            .range(from.to_string()..=to.to_string())
            .map(|(_, v)| v)
            .collect()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectHealth {
    pub project_id: String,
    pub score_per_mille: u16,
    pub status: String,
}

pub fn compute_project_health(
    project_id: impl Into<String>,
    focus_minutes: u32,
    tasks_done: u32,
    inbox_backlog: u32,
) -> ProjectHealth {
    let mut score = 500_i32;
    score += (focus_minutes as i32 / 10).min(300);
    score += (tasks_done as i32 * 40).min(300);
    score -= (inbox_backlog as i32 * 20).min(400);
    let score = score.clamp(0, 1000) as u16;

    let status = if score >= 800 {
        "thriving"
    } else if score >= 600 {
        "healthy"
    } else if score >= 350 {
        "strained"
    } else {
        "critical"
    };

    ProjectHealth {
        project_id: project_id.into(),
        score_per_mille: score,
        status: status.to_string(),
    }
}

pub fn ymd_key(ts: Timestamp) -> String {
    let days = ts.div_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

fn civil_from_days(days_since_epoch: i64) -> (i32, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    y += if m <= 2 { 1 } else { 0 };
    (y as i32, m as u32, d as u32)
}

#[cfg(test)]
mod tests {
    use super::*;
    use core_domain::DomainEvent;

    #[test]
    fn metrics_engine_aggregates_daily_events() {
        let mut metrics = MetricsEngine::new();
        metrics.ingest(
            0,
            &DomainEvent::InboxItemCaptured {
                inbox_id: "i1".to_string(),
            },
        );
        metrics.ingest(
            0,
            &DomainEvent::FocusSessionLogged {
                session_id: "f1".to_string(),
                minutes: 25,
            },
        );

        let row = metrics
            .get_day("1970-01-01")
            .expect("day should exist in projection");
        assert_eq!(row.inbox_in, 1);
        assert_eq!(row.focus_minutes, 25);
    }

    #[test]
    fn project_health_status_changes_with_inputs() {
        let healthy = compute_project_health("p1", 400, 8, 1);
        let critical = compute_project_health("p1", 0, 0, 20);
        assert!(healthy.score_per_mille > critical.score_per_mille);
        assert_eq!(critical.status, "critical");
    }

    #[test]
    fn ymd_key_handles_unix_epoch() {
        assert_eq!(ymd_key(0), "1970-01-01");
    }
}
