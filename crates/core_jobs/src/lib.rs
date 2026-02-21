use std::collections::{BTreeMap, BTreeSet};

use core_domain::{DomainEvent, Job, JobKind, JobStatus, Timestamp, make_id, now_ts};

#[derive(Debug, Default)]
pub struct JobQueue {
    pending: BTreeMap<String, Job>,
    dedupe_index: BTreeSet<(String, String)>,
    sequence: u64,
    pub dead_letter: Vec<Job>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JobExecutionResult {
    Success(Vec<DomainEvent>),
    RetryableError(String),
    FatalError(String),
}

pub trait JobExecutor {
    fn execute(&self, job: &Job) -> JobExecutionResult;
}

impl JobQueue {
    pub fn enqueue(
        &mut self,
        kind: JobKind,
        payload: impl Into<String>,
        priority: u8,
        run_at: Timestamp,
        max_attempts: u32,
    ) -> Job {
        self.sequence += 1;
        let id = make_id("job", self.sequence);
        let job = Job {
            id: id.clone(),
            kind,
            payload: payload.into(),
            dedupe_key: None,
            status: JobStatus::Pending,
            priority,
            run_at,
            attempts: 0,
            max_attempts: max_attempts.max(1),
            last_error: None,
        };
        self.pending.insert(id, job.clone());
        job
    }

    pub fn enqueue_with_dedupe(
        &mut self,
        kind: JobKind,
        dedupe_key: impl Into<String>,
        payload: impl Into<String>,
        priority: u8,
        run_at: Timestamp,
        max_attempts: u32,
    ) -> Option<Job> {
        let dedupe_key = dedupe_key.into();
        let token = (kind.as_str().to_string(), dedupe_key.clone());
        if self.dedupe_index.contains(&token) {
            return None;
        }

        let mut job = self.enqueue(kind, payload, priority, run_at, max_attempts);
        job.dedupe_key = Some(dedupe_key);
        self.pending.insert(job.id.clone(), job.clone());
        self.dedupe_index.insert(token);
        Some(job)
    }

    pub fn pending_len(&self) -> usize {
        self.pending.len()
    }

    pub fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }

    pub fn peek_due(&self, now: Timestamp, limit: usize) -> Vec<Job> {
        let mut due: Vec<Job> = self
            .pending
            .values()
            .filter(|job| job.run_at <= now)
            .cloned()
            .collect();
        due.sort_by_key(|job| (job.run_at, job.priority));
        due.into_iter().take(limit).collect()
    }

    fn take_due(&mut self, now: Timestamp, limit: usize) -> Vec<Job> {
        let due_ids: Vec<String> = self
            .peek_due(now, limit)
            .iter()
            .map(|job| job.id.clone())
            .collect();

        let mut taken = Vec::with_capacity(due_ids.len());
        for id in due_ids {
            if let Some(mut job) = self.pending.remove(&id) {
                job.status = JobStatus::Running;
                taken.push(job);
            }
        }
        taken
    }

    fn release_dedupe_if_needed(&mut self, job: &Job) {
        if let Some(dedupe_key) = &job.dedupe_key {
            self.dedupe_index
                .remove(&(job.kind.as_str().to_string(), dedupe_key.clone()));
        }
    }

    fn backoff_seconds(attempt: u32) -> i64 {
        let exponent = attempt.min(8);
        (1_i64 << exponent) * 60
    }

    pub fn run_due<E: JobExecutor>(
        &mut self,
        now: Timestamp,
        limit: usize,
        executor: &E,
    ) -> Vec<DomainEvent> {
        let mut events = Vec::new();
        let due_jobs = self.take_due(now, limit);

        for mut job in due_jobs {
            match executor.execute(&job) {
                JobExecutionResult::Success(mut produced_events) => {
                    job.status = JobStatus::Succeeded;
                    self.release_dedupe_if_needed(&job);
                    events.push(DomainEvent::JobCompleted {
                        job_id: job.id.clone(),
                    });
                    events.append(&mut produced_events);
                }
                JobExecutionResult::RetryableError(reason) => {
                    job.attempts += 1;
                    if job.attempts >= job.max_attempts {
                        job.status = JobStatus::DeadLetter;
                        job.last_error = Some(reason.clone());
                        self.release_dedupe_if_needed(&job);
                        self.dead_letter.push(job.clone());
                    } else {
                        job.status = JobStatus::Pending;
                        job.last_error = Some(reason.clone());
                        job.run_at = now + Self::backoff_seconds(job.attempts);
                        self.pending.insert(job.id.clone(), job.clone());
                    }
                    events.push(DomainEvent::JobFailed {
                        job_id: job.id.clone(),
                        attempts: job.attempts,
                        reason,
                    });
                }
                JobExecutionResult::FatalError(reason) => {
                    job.attempts += 1;
                    job.status = JobStatus::DeadLetter;
                    job.last_error = Some(reason.clone());
                    self.release_dedupe_if_needed(&job);
                    self.dead_letter.push(job.clone());
                    events.push(DomainEvent::JobFailed {
                        job_id: job.id.clone(),
                        attempts: job.attempts,
                        reason,
                    });
                }
            }
        }

        events
    }
}

pub fn make_default_job(kind: JobKind, payload: impl Into<String>) -> Job {
    Job {
        id: make_id("job", now_ts() as u64),
        kind,
        payload: payload.into(),
        dedupe_key: None,
        status: JobStatus::Pending,
        priority: 5,
        run_at: now_ts(),
        attempts: 0,
        max_attempts: 5,
        last_error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestExecutor;

    impl JobExecutor for TestExecutor {
        fn execute(&self, job: &Job) -> JobExecutionResult {
            if job.kind == JobKind::Summarize {
                JobExecutionResult::Success(vec![DomainEvent::NoteUpserted {
                    note_id: "n1".to_string(),
                    path: "vault/n1.md".to_string(),
                }])
            } else if job.kind == JobKind::ExtractTasks {
                JobExecutionResult::RetryableError("temp failure".to_string())
            } else {
                JobExecutionResult::FatalError("unsupported".to_string())
            }
        }
    }

    #[test]
    fn dedupe_works() {
        let mut queue = JobQueue::default();
        let first = queue.enqueue_with_dedupe(JobKind::Summarize, "inbox:1", "{}", 5, 10, 3);
        assert!(first.is_some());
        let second = queue.enqueue_with_dedupe(JobKind::Summarize, "inbox:1", "{}", 5, 10, 3);
        assert!(second.is_none());
    }

    #[test]
    fn retry_moves_job_back_to_pending_with_backoff() {
        let mut queue = JobQueue::default();
        queue.enqueue(JobKind::ExtractTasks, "{}", 5, 0, 3);
        let events = queue.run_due(0, 10, &TestExecutor);
        assert_eq!(events.len(), 1);
        let pending = queue.peek_due(i64::MAX, 10);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].attempts, 1);
        assert!(pending[0].run_at > 0);
    }

    #[test]
    fn success_emits_completion_and_events() {
        let mut queue = JobQueue::default();
        queue.enqueue(JobKind::Summarize, "{}", 1, 0, 3);
        let events = queue.run_due(0, 10, &TestExecutor);
        assert!(
            events
                .iter()
                .any(|event| matches!(event, DomainEvent::JobCompleted { .. }))
        );
        assert!(
            events
                .iter()
                .any(|event| matches!(event, DomainEvent::NoteUpserted { .. }))
        );
    }

    #[test]
    fn fatal_moves_to_dead_letter() {
        let mut queue = JobQueue::default();
        queue.enqueue(JobKind::AutoTag, "{}", 1, 0, 3);
        let events = queue.run_due(0, 10, &TestExecutor);
        assert_eq!(events.len(), 1);
        assert_eq!(queue.dead_letter.len(), 1);
        assert_eq!(queue.dead_letter[0].status, JobStatus::DeadLetter);
    }
}
