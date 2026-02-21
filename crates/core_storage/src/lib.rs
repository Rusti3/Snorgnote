use std::collections::BTreeMap;

use core_domain::{
    DomainEvent, EventEnvelope, InboxItem, InboxStatus, Job, JobKind, JobStatus, Timestamp, now_ts,
};

pub const MIGRATION_0001_SQL: &str = include_str!("../../../migrations/0001_init.sql");

#[derive(Debug, Default)]
pub struct EventStore {
    events: Vec<EventEnvelope>,
    sequence: u64,
}

impl EventStore {
    pub fn append(
        &mut self,
        actor: impl Into<String>,
        stream: impl Into<String>,
        event: DomainEvent,
        causation_id: Option<String>,
        correlation_id: Option<String>,
    ) -> EventEnvelope {
        self.sequence += 1;
        let envelope = EventEnvelope {
            id: format!("evt-{:016x}", self.sequence),
            ts: now_ts(),
            actor: actor.into(),
            stream: stream.into(),
            event,
            causation_id,
            correlation_id,
        };
        self.events.push(envelope.clone());
        envelope
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    pub fn all(&self) -> &[EventEnvelope] {
        &self.events
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DailyMetricsRow {
    pub inbox_in: u32,
    pub inbox_done: u32,
    pub notes_created: u32,
    pub tasks_extracted: u32,
    pub focus_minutes: u32,
    pub reviews_scheduled: u32,
    pub reviews_completed: u32,
}

#[derive(Debug, Default)]
pub struct ProjectionStore {
    pub inbox: BTreeMap<String, InboxItem>,
    pub jobs: BTreeMap<String, Job>,
    pub metrics_daily: BTreeMap<String, DailyMetricsRow>,
}

impl ProjectionStore {
    pub fn apply_event(&mut self, envelope: &EventEnvelope) {
        let day = ymd_key(envelope.ts);
        let metrics = self.metrics_daily.entry(day).or_default();
        match &envelope.event {
            DomainEvent::InboxItemCaptured { inbox_id } => {
                metrics.inbox_in += 1;
                if let Some(item) = self.inbox.get_mut(inbox_id) {
                    item.status = InboxStatus::Pending;
                }
            }
            DomainEvent::InboxItemProcessed { inbox_id } => {
                metrics.inbox_done += 1;
                if let Some(item) = self.inbox.get_mut(inbox_id) {
                    item.status = InboxStatus::Processed;
                }
            }
            DomainEvent::JobEnqueued { job_id, kind } => {
                self.jobs.entry(job_id.clone()).or_insert(Job {
                    id: job_id.clone(),
                    kind: kind.clone(),
                    payload: String::new(),
                    dedupe_key: None,
                    status: JobStatus::Pending,
                    priority: 5,
                    run_at: envelope.ts,
                    attempts: 0,
                    max_attempts: 5,
                    last_error: None,
                });
            }
            DomainEvent::JobCompleted { job_id } => {
                if let Some(job) = self.jobs.get_mut(job_id) {
                    job.status = JobStatus::Succeeded;
                }
            }
            DomainEvent::JobFailed {
                job_id,
                attempts,
                reason,
            } => {
                if let Some(job) = self.jobs.get_mut(job_id) {
                    job.status = if *attempts >= job.max_attempts {
                        JobStatus::DeadLetter
                    } else {
                        JobStatus::Failed
                    };
                    job.attempts = *attempts;
                    job.last_error = Some(reason.clone());
                }
            }
            DomainEvent::NoteUpserted { .. } => metrics.notes_created += 1,
            DomainEvent::TaskExtracted { .. } => metrics.tasks_extracted += 1,
            DomainEvent::FocusSessionLogged { minutes, .. } => metrics.focus_minutes += *minutes,
            DomainEvent::ReviewScheduled { .. } => metrics.reviews_scheduled += 1,
            DomainEvent::ReviewCompleted { .. } => metrics.reviews_completed += 1,
        }
    }

    pub fn replay_from(&mut self, events: &[EventEnvelope]) {
        for event in events {
            self.apply_event(event);
        }
    }
}

pub fn ymd_key(ts: Timestamp) -> String {
    let days = ts.div_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

// Howard Hinnant civil-from-days algorithm.
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

pub fn default_jobs_schema_sql() -> &'static str {
    "CREATE TABLE jobs(
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL,
        run_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL,
        max_attempts INTEGER NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );"
}

pub fn default_events_schema_sql() -> &'static str {
    "CREATE TABLE events(
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        actor TEXT NOT NULL,
        stream TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        causation_id TEXT,
        correlation_id TEXT
    );"
}

pub fn default_fts_schema_sql() -> &'static str {
    "CREATE VIRTUAL TABLE notes_fts USING fts5(title, body, tags);"
}

pub fn seed_job(kind: JobKind, payload: impl Into<String>, run_at: Timestamp) -> Job {
    Job {
        id: format!("job-{}", now_ts()),
        kind,
        payload: payload.into(),
        dedupe_key: None,
        status: JobStatus::Pending,
        priority: 5,
        run_at,
        attempts: 0,
        max_attempts: 5,
        last_error: None,
    }
}

#[cfg(test)]
mod tests {
    use core_domain::{DomainEvent, JobKind};

    use super::*;

    #[test]
    fn date_key_is_utc_based() {
        assert_eq!(ymd_key(0), "1970-01-01");
        assert_eq!(ymd_key(86_400), "1970-01-02");
    }

    #[test]
    fn replay_updates_metrics_projection() {
        let mut store = EventStore::default();
        store.append(
            "test",
            "inbox",
            DomainEvent::InboxItemCaptured {
                inbox_id: "i1".to_string(),
            },
            None,
            None,
        );
        store.append(
            "test",
            "jobs",
            DomainEvent::TaskExtracted {
                task_id: "t1".to_string(),
                note_id: "n1".to_string(),
            },
            None,
            None,
        );

        let mut projections = ProjectionStore::default();
        projections.replay_from(store.all());

        let day = ymd_key(now_ts());
        let metrics = projections
            .metrics_daily
            .get(&day)
            .expect("daily projection should exist");
        assert_eq!(metrics.inbox_in, 1);
        assert_eq!(metrics.tasks_extracted, 1);
    }

    #[test]
    fn seeded_job_is_pending() {
        let job = seed_job(JobKind::Summarize, "{}", 10);
        assert_eq!(job.status, JobStatus::Pending);
        assert_eq!(job.run_at, 10);
    }
}
