use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use core_domain::{
    CaptureSource, DomainEvent, InboxItem, InboxStatus, JobKind, SessionOutcome, make_id, now_ts,
};
use core_focus::PomodoroEngine;
use core_jobs::{JobExecutionResult, JobExecutor, JobQueue};
use core_metrics::{DailyMetrics, MetricsEngine, compute_project_health, ymd_key};
use core_planning::{
    DailyPlan, PlanningContext, ReviewGrade, ReviewItem, ReviewState, TaskInput, WeeklyMetrics,
    WeeklyPlan, generate_daily_plan, generate_weekly_plan, select_due_reviews, update_review_state,
};
use core_skills::SkillRegistry;
use core_storage::{EventStore, ProjectionStore};
use core_vault::{NoteSummary, index_vault, to_summary};

#[derive(Debug, Clone)]
pub struct ReviewCard {
    pub note_id: String,
    pub title: String,
    pub importance: u8,
    pub due_at: i64,
    pub state: ReviewState,
}

#[derive(Debug)]
struct AppStateInner {
    vault_root: PathBuf,
    sequence: u64,
    event_store: EventStore,
    projections: ProjectionStore,
    jobs: JobQueue,
    skills: SkillRegistry,
    focus: PomodoroEngine,
    metrics: MetricsEngine,
    reviews: BTreeMap<String, ReviewCard>,
}

#[derive(Clone, Debug)]
pub struct AppState {
    inner: Arc<Mutex<AppStateInner>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DashboardSnapshot {
    pub day_key: String,
    pub inbox_pending: usize,
    pub jobs_pending: usize,
    pub dead_letter_jobs: usize,
    pub focus_minutes_total: u32,
    pub due_reviews: usize,
    pub today_metrics: Option<DailyMetrics>,
    pub project_health: Vec<(String, u16, String)>,
}

impl AppState {
    pub fn new(vault_root: impl Into<PathBuf>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(AppStateInner {
                vault_root: vault_root.into(),
                sequence: 0,
                event_store: EventStore::default(),
                projections: ProjectionStore::default(),
                jobs: JobQueue::default(),
                skills: SkillRegistry::empty(),
                focus: PomodoroEngine::new(),
                metrics: MetricsEngine::new(),
                reviews: BTreeMap::new(),
            })),
        }
    }

    pub fn vault_open(&self, path: impl AsRef<Path>) -> Result<(), String> {
        let mut state = self.lock()?;
        state.vault_root = path.as_ref().to_path_buf();
        Ok(())
    }

    pub fn vault_scan(&self) -> Result<Vec<NoteSummary>, String> {
        let state = self.lock()?;
        let notes = index_vault(&state.vault_root).map_err(|err| err.to_string())?;
        Ok(notes.iter().map(to_summary).collect())
    }

    pub fn capture_manual(
        &self,
        content_md: impl Into<String>,
        tags: Vec<String>,
        project: Option<String>,
        source: Option<CaptureSource>,
    ) -> Result<InboxItem, String> {
        let mut state = self.lock()?;
        state.sequence += 1;
        let inbox = InboxItem {
            id: make_id("inbox", state.sequence),
            source: source.unwrap_or(CaptureSource::Manual),
            captured_at: now_ts(),
            content_md: content_md.into(),
            tags,
            project,
            status: InboxStatus::Pending,
            metadata: BTreeMap::new(),
        };
        state
            .projections
            .inbox
            .insert(inbox.id.clone(), inbox.clone());

        let envelope = state.event_store.append(
            "user",
            "inbox",
            DomainEvent::InboxItemCaptured {
                inbox_id: inbox.id.clone(),
            },
            None,
            None,
        );
        state.projections.apply_event(&envelope);
        state.metrics.ingest(envelope.ts, &envelope.event);
        Ok(inbox)
    }

    pub fn inbox_list(&self) -> Result<Vec<InboxItem>, String> {
        let state = self.lock()?;
        Ok(state.projections.inbox.values().cloned().collect())
    }

    pub fn job_enqueue(
        &self,
        kind: JobKind,
        payload: impl Into<String>,
        priority: u8,
        run_at: Option<i64>,
        dedupe_key: Option<String>,
    ) -> Result<String, String> {
        let mut state = self.lock()?;
        let run_at = run_at.unwrap_or_else(now_ts);
        let job = if let Some(dedupe) = dedupe_key {
            state
                .jobs
                .enqueue_with_dedupe(kind, dedupe, payload, priority, run_at, 5)
        } else {
            Some(state.jobs.enqueue(kind, payload, priority, run_at, 5))
        };
        let Some(job) = job else {
            return Err("job skipped because dedupe key already exists".to_string());
        };

        let envelope = state.event_store.append(
            "system",
            "jobs",
            DomainEvent::JobEnqueued {
                job_id: job.id.clone(),
                kind: job.kind.clone(),
            },
            None,
            None,
        );
        state.projections.apply_event(&envelope);
        state.metrics.ingest(envelope.ts, &envelope.event);
        Ok(job.id)
    }

    pub fn run_jobs<E: JobExecutor>(
        &self,
        now: i64,
        limit: usize,
        executor: &E,
    ) -> Result<Vec<DomainEvent>, String> {
        let mut state = self.lock()?;
        let events = state.jobs.run_due(now, limit, executor);
        for event in &events {
            let envelope = state
                .event_store
                .append("worker", "jobs", event.clone(), None, None);
            state.projections.apply_event(&envelope);
            state.metrics.ingest(envelope.ts, event);
        }
        Ok(events)
    }

    pub fn skills_load_dir(&self, path: impl AsRef<Path>) -> Result<usize, String> {
        let mut state = self.lock()?;
        state.skills = SkillRegistry::load_from_dir(path).map_err(|err| err.to_string())?;
        Ok(state.skills.list().len())
    }

    pub fn skills_list(&self) -> Result<Vec<String>, String> {
        let state = self.lock()?;
        Ok(state
            .skills
            .list()
            .into_iter()
            .map(|skill| skill.id.clone())
            .collect())
    }

    pub fn skill_enable(&self, id: &str, enabled: bool) -> Result<(), String> {
        let mut state = self.lock()?;
        if state.skills.set_enabled(id, enabled) {
            Ok(())
        } else {
            Err(format!("skill `{id}` not found"))
        }
    }

    pub fn review_seed(
        &self,
        note_id: impl Into<String>,
        title: impl Into<String>,
        importance: u8,
        due_at: i64,
    ) -> Result<(), String> {
        let mut state = self.lock()?;
        let note_id = note_id.into();
        let card = ReviewCard {
            note_id: note_id.clone(),
            title: title.into(),
            importance,
            due_at,
            state: ReviewState {
                interval_days: 1,
                stability: 1.0,
                last_reviewed: 0,
            },
        };
        state.reviews.insert(note_id.clone(), card);
        let envelope = state.event_store.append(
            "system",
            "review",
            DomainEvent::ReviewScheduled { note_id, due_at },
            None,
            None,
        );
        state.metrics.ingest(envelope.ts, &envelope.event);
        Ok(())
    }

    pub fn review_get_due(&self, now: i64, limit: usize) -> Result<Vec<ReviewItem>, String> {
        let state = self.lock()?;
        let items = state
            .reviews
            .values()
            .map(|card| ReviewItem {
                note_id: card.note_id.clone(),
                title: card.title.clone(),
                importance: card.importance,
                due_at: card.due_at,
            })
            .collect::<Vec<_>>();
        Ok(select_due_reviews(items, now, limit))
    }

    pub fn review_mark(
        &self,
        note_id: &str,
        grade: ReviewGrade,
        reviewed_at: i64,
    ) -> Result<(), String> {
        let mut state = self.lock()?;
        let card = state
            .reviews
            .get_mut(note_id)
            .ok_or_else(|| format!("review note `{note_id}` not found"))?;
        card.state = update_review_state(card.state, grade, reviewed_at);
        card.due_at = reviewed_at + (card.state.interval_days as i64 * 86_400);

        let envelope = state.event_store.append(
            "user",
            "review",
            DomainEvent::ReviewCompleted {
                note_id: note_id.to_string(),
                grade: format!("{grade:?}").to_ascii_lowercase(),
            },
            None,
            None,
        );
        state.metrics.ingest(envelope.ts, &envelope.event);
        Ok(())
    }

    pub fn daily_generate(
        &self,
        day_key: impl Into<String>,
        now: i64,
    ) -> Result<DailyPlan, String> {
        let day_key = day_key.into();
        let state = self.lock()?;
        let due_reviews = state
            .reviews
            .values()
            .filter(|card| card.due_at <= now)
            .map(|card| ReviewItem {
                note_id: card.note_id.clone(),
                title: card.title.clone(),
                importance: card.importance,
                due_at: card.due_at,
            })
            .collect::<Vec<_>>();

        let tasks = state
            .projections
            .jobs
            .values()
            .map(|job| TaskInput {
                id: job.id.clone(),
                title: format!("Process job `{}`", job.kind.as_str()),
                priority: job.priority,
                due_at: Some(job.run_at),
                project_id: None,
                estimated_min: 25,
            })
            .collect::<Vec<_>>();

        let context = PlanningContext {
            tasks,
            review_due: due_reviews,
            projects: Vec::new(),
            mood_score: None,
        };
        Ok(generate_daily_plan(day_key, &context))
    }

    pub fn weekly_generate(&self, week_start_key: impl Into<String>) -> Result<WeeklyPlan, String> {
        let state = self.lock()?;
        let metrics = WeeklyMetrics {
            tasks_done: state
                .projections
                .jobs
                .values()
                .filter(|job| job.status == core_domain::JobStatus::Succeeded)
                .count() as u32,
            focus_minutes: state.focus.total_minutes(),
            inbox_processed: state
                .projections
                .inbox
                .values()
                .filter(|item| item.status == InboxStatus::Processed)
                .count() as u32,
            reviews_done: state
                .metrics
                .all_days()
                .iter()
                .map(|row| row.reviews_completed)
                .sum(),
        };
        Ok(generate_weekly_plan(week_start_key, &metrics, &[]))
    }

    pub fn pomodoro_start(
        &self,
        task_id: Option<String>,
        project_id: Option<String>,
        minutes: u32,
        started_at: i64,
    ) -> Result<String, String> {
        let mut state = self.lock()?;
        let session = state.focus.start(task_id, project_id, minutes, started_at);
        Ok(session.id)
    }

    pub fn pomodoro_stop(
        &self,
        session_id: &str,
        ended_at: i64,
        outcome: SessionOutcome,
    ) -> Result<u32, String> {
        let mut state = self.lock()?;
        let session = state
            .focus
            .stop(session_id, ended_at, outcome)
            .ok_or_else(|| format!("session `{session_id}` not found"))?;
        let envelope = state.event_store.append(
            "user",
            "focus",
            DomainEvent::FocusSessionLogged {
                session_id: session.id.clone(),
                minutes: session.actual_min,
            },
            None,
            None,
        );
        state.metrics.ingest(envelope.ts, &envelope.event);
        Ok(session.actual_min)
    }

    pub fn dashboard_get(&self, now: i64) -> Result<DashboardSnapshot, String> {
        let state = self.lock()?;
        let day_key = ymd_key(now);
        let focus_by_project = state.focus.minutes_by_project();
        let project_health = focus_by_project
            .iter()
            .map(|(project_id, minutes)| {
                let health = compute_project_health(project_id, *minutes, 0, 0);
                (project_id.clone(), health.score_per_mille, health.status)
            })
            .collect::<Vec<_>>();

        Ok(DashboardSnapshot {
            day_key: day_key.clone(),
            inbox_pending: state
                .projections
                .inbox
                .values()
                .filter(|item| item.status == InboxStatus::Pending)
                .count(),
            jobs_pending: state.jobs.pending_len(),
            dead_letter_jobs: state.jobs.dead_letter.len(),
            focus_minutes_total: state.focus.total_minutes(),
            due_reviews: state
                .reviews
                .values()
                .filter(|card| card.due_at <= now)
                .count(),
            today_metrics: state.metrics.get_day(&day_key).cloned(),
            project_health,
        })
    }

    fn lock(&self) -> Result<MutexGuard<'_, AppStateInner>, String> {
        self.inner
            .lock()
            .map_err(|_| "app state lock poisoned".to_string())
    }
}

pub struct NoopExecutor;

impl JobExecutor for NoopExecutor {
    fn execute(&self, _job: &core_domain::Job) -> JobExecutionResult {
        JobExecutionResult::Success(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_and_dashboard_flow() {
        let state = AppState::new(".");
        state
            .capture_manual("first note", vec!["inbox".to_string()], None, None)
            .expect("capture should work");
        let dashboard = state
            .dashboard_get(now_ts())
            .expect("dashboard should build");
        assert_eq!(dashboard.inbox_pending, 1);
    }

    #[test]
    fn job_flow_reaches_completion() {
        let state = AppState::new(".");
        state
            .job_enqueue(JobKind::Summarize, "{}", 1, Some(0), None)
            .expect("job should enqueue");
        let events = state
            .run_jobs(0, 10, &NoopExecutor)
            .expect("job run should succeed");
        assert!(
            events
                .iter()
                .any(|event| matches!(event, DomainEvent::JobCompleted { .. }))
        );
    }

    #[test]
    fn review_cycle_updates_due_date() {
        let state = AppState::new(".");
        state
            .review_seed("n1", "Note", 10, 0)
            .expect("review seed should succeed");
        let due = state
            .review_get_due(0, 10)
            .expect("should read due reviews");
        assert_eq!(due.len(), 1);
        state
            .review_mark("n1", ReviewGrade::Good, 10)
            .expect("review mark should succeed");
        let after = state
            .review_get_due(10, 10)
            .expect("reviews should still load");
        assert!(after.is_empty());
    }
}
