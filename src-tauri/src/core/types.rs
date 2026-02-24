use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
pub struct NoteSummary {
    pub id: String,
    pub path: String,
    pub title: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NoteDocument {
    pub id: String,
    pub path: String,
    pub title: String,
    pub body_md: String,
    pub frontmatter: Value,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrashedNoteSummary {
    pub id: String,
    pub title: String,
    pub original_path: String,
    pub deleted_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InboxItemView {
    pub id: String,
    pub source: String,
    pub content_text: String,
    pub created_at: String,
    pub status: String,
    pub project_hint: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TrashedInboxItem {
    pub id: String,
    pub source: String,
    pub content_text: String,
    pub created_at: String,
    pub deleted_at: String,
    pub tags: Vec<String>,
    pub previous_status: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct JobRunReport {
    pub processed: i64,
    pub succeeded: i64,
    pub failed: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillRecord {
    pub id: String,
    pub slug: String,
    pub version: i64,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillValidation {
    pub valid: bool,
    pub parsed_id: Option<String>,
    pub errors: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillRunResult {
    pub skill_id: String,
    pub queued_jobs: i64,
    pub report: JobRunReport,
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyPlan {
    pub date: String,
    pub path: String,
    pub suggestions: Vec<String>,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WeeklyPlan {
    pub week: String,
    pub path: String,
    pub highlights: Vec<String>,
    pub markdown: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FocusSessionView {
    pub id: String,
    pub project_id: Option<String>,
    pub task_id: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub paused_at: Option<String>,
    pub paused_total_sec: Option<i64>,
    pub duration_sec: Option<i64>,
    pub status: Option<String>,
    pub elapsed_sec: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectFocusStat {
    pub project_id: String,
    pub minutes: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FocusStats {
    pub total_minutes: i64,
    pub sessions: i64,
    pub by_project: Vec<ProjectFocusStat>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FocusHistoryItem {
    pub id: String,
    pub project_id: Option<String>,
    pub task_id: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub paused_total_sec: i64,
    pub duration_sec: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FocusHistoryPage {
    pub items: Vec<FocusHistoryItem>,
    pub total: i64,
    pub limit: u32,
    pub offset: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct DashboardOverview {
    pub notes: i64,
    pub inbox_new: i64,
    pub jobs_queued: i64,
    pub focus_minutes_today: i64,
    pub reviews_due: i64,
    pub projects_active: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectState {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub biome_type: String,
    pub health: f64,
    pub xp: i64,
    pub level: i64,
    pub open_tasks: i64,
    pub done_today: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TelegramStatus {
    pub configured: bool,
    pub verified: bool,
    pub running: bool,
    pub username: Option<String>,
    pub chat_id: Option<String>,
    pub last_poll_at: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TelegramVerificationCode {
    pub code: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TelegramPollReport {
    pub fetched: i64,
    pub accepted: i64,
    pub rejected: i64,
    pub verified_now: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SkillConfig {
    pub id: String,
    #[serde(default = "default_skill_version")]
    pub version: u32,
    #[serde(default = "default_skill_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub inputs: SkillInputs,
    #[serde(default)]
    pub jobs: Vec<SkillJob>,
    #[serde(default)]
    pub outputs: Vec<SkillOutput>,
    #[serde(default)]
    pub schedule: Option<SkillSchedule>,
    #[serde(default)]
    pub triggers: Vec<SkillTrigger>,
}

#[derive(Debug, Default, Clone, Deserialize, Serialize)]
pub struct SkillInputs {
    #[serde(default)]
    pub sources: Vec<String>,
    #[serde(default)]
    pub filters: SkillFilters,
}

#[derive(Debug, Default, Clone, Deserialize, Serialize)]
pub struct SkillFilters {
    #[serde(default)]
    pub tags_any: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SkillJob {
    #[serde(rename = "type")]
    pub job_type: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SkillOutput {
    pub target: String,
    #[serde(default)]
    pub path_template: Option<String>,
    #[serde(default)]
    pub section: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SkillSchedule {
    pub cron: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SkillTrigger {
    pub event: String,
}

fn default_skill_version() -> u32 {
    1
}

fn default_skill_enabled() -> bool {
    true
}
