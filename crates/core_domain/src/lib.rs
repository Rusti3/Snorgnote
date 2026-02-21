use std::collections::BTreeMap;
use std::fmt::{Display, Formatter};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

pub type Timestamp = i64;

pub fn now_ts() -> Timestamp {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::from_secs(0));
    duration.as_secs() as Timestamp
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CaptureSource {
    Manual,
    Telegram,
    Browser,
    Email,
    Voice,
    Screenshot,
    Unknown(String),
}

impl CaptureSource {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Manual => "manual",
            Self::Telegram => "telegram",
            Self::Browser => "browser",
            Self::Email => "email",
            Self::Voice => "voice",
            Self::Screenshot => "screenshot",
            Self::Unknown(value) => value.as_str(),
        }
    }
}

impl Display for CaptureSource {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl From<&str> for CaptureSource {
    fn from(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "manual" => Self::Manual,
            "telegram" => Self::Telegram,
            "browser" => Self::Browser,
            "email" => Self::Email,
            "voice" => Self::Voice,
            "screenshot" => Self::Screenshot,
            other => Self::Unknown(other.to_owned()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InboxStatus {
    Pending,
    Processing,
    Processed,
    Archived,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InboxItem {
    pub id: String,
    pub source: CaptureSource,
    pub captured_at: Timestamp,
    pub content_md: String,
    pub tags: Vec<String>,
    pub project: Option<String>,
    pub status: InboxStatus,
    pub metadata: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JobKind {
    Summarize,
    ExtractTasks,
    AutoTag,
    PlanDaily,
    PlanWeekly,
    SpacedReviewPick,
    Custom(String),
}

impl JobKind {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Summarize => "summarize",
            Self::ExtractTasks => "extract_tasks",
            Self::AutoTag => "auto_tag",
            Self::PlanDaily => "plan_daily",
            Self::PlanWeekly => "plan_weekly",
            Self::SpacedReviewPick => "spaced_review_pick",
            Self::Custom(value) => value.as_str(),
        }
    }
}

impl Display for JobKind {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl From<&str> for JobKind {
    fn from(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "summarize" => Self::Summarize,
            "extract_tasks" => Self::ExtractTasks,
            "auto_tag" => Self::AutoTag,
            "plan_daily" => Self::PlanDaily,
            "plan_weekly" => Self::PlanWeekly,
            "spaced_review_pick" => Self::SpacedReviewPick,
            custom => Self::Custom(custom.to_owned()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
    DeadLetter,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Job {
    pub id: String,
    pub kind: JobKind,
    pub payload: String,
    pub dedupe_key: Option<String>,
    pub status: JobStatus,
    pub priority: u8,
    pub run_at: Timestamp,
    pub attempts: u32,
    pub max_attempts: u32,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskStatus {
    Todo,
    InProgress,
    Done,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Task {
    pub id: String,
    pub source_note_id: Option<String>,
    pub title: String,
    pub status: TaskStatus,
    pub priority: u8,
    pub due_at: Option<Timestamp>,
    pub project_id: Option<String>,
    pub next_action: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionOutcome {
    Completed,
    Interrupted,
    Abandoned,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FocusSession {
    pub id: String,
    pub task_id: Option<String>,
    pub project_id: Option<String>,
    pub started_at: Timestamp,
    pub ended_at: Option<Timestamp>,
    pub planned_min: u32,
    pub actual_min: u32,
    pub outcome: Option<SessionOutcome>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventEnvelope {
    pub id: String,
    pub ts: Timestamp,
    pub actor: String,
    pub stream: String,
    pub event: DomainEvent,
    pub causation_id: Option<String>,
    pub correlation_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DomainEvent {
    InboxItemCaptured {
        inbox_id: String,
    },
    InboxItemProcessed {
        inbox_id: String,
    },
    JobEnqueued {
        job_id: String,
        kind: JobKind,
    },
    JobCompleted {
        job_id: String,
    },
    JobFailed {
        job_id: String,
        attempts: u32,
        reason: String,
    },
    NoteUpserted {
        note_id: String,
        path: String,
    },
    TaskExtracted {
        task_id: String,
        note_id: String,
    },
    FocusSessionLogged {
        session_id: String,
        minutes: u32,
    },
    ReviewScheduled {
        note_id: String,
        due_at: Timestamp,
    },
    ReviewCompleted {
        note_id: String,
        grade: String,
    },
}

impl DomainEvent {
    pub fn event_type(&self) -> &'static str {
        match self {
            Self::InboxItemCaptured { .. } => "inbox_item_captured",
            Self::InboxItemProcessed { .. } => "inbox_item_processed",
            Self::JobEnqueued { .. } => "job_enqueued",
            Self::JobCompleted { .. } => "job_completed",
            Self::JobFailed { .. } => "job_failed",
            Self::NoteUpserted { .. } => "note_upserted",
            Self::TaskExtracted { .. } => "task_extracted",
            Self::FocusSessionLogged { .. } => "focus_session_logged",
            Self::ReviewScheduled { .. } => "review_scheduled",
            Self::ReviewCompleted { .. } => "review_completed",
        }
    }
}

pub fn make_id(prefix: &str, sequence: u64) -> String {
    format!("{prefix}-{sequence:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_source_parses_known_values() {
        assert_eq!(CaptureSource::from("telegram"), CaptureSource::Telegram);
        assert_eq!(CaptureSource::from("manual"), CaptureSource::Manual);
    }

    #[test]
    fn capture_source_keeps_unknown_values() {
        assert_eq!(
            CaptureSource::from("rss"),
            CaptureSource::Unknown("rss".to_string())
        );
    }

    #[test]
    fn job_kind_roundtrip() {
        let custom = JobKind::from("custom_processor");
        assert_eq!(custom.as_str(), "custom_processor");
        assert_eq!(JobKind::from("summarize"), JobKind::Summarize);
    }

    #[test]
    fn event_type_is_stable() {
        let event = DomainEvent::ReviewScheduled {
            note_id: "n1".to_string(),
            due_at: 100,
        };
        assert_eq!(event.event_type(), "review_scheduled");
    }

    #[test]
    fn make_id_is_prefixed() {
        let id = make_id("job", 42);
        assert!(id.starts_with("job-"));
    }
}
