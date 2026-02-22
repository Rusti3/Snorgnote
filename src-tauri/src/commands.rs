use tauri::State;

use crate::core::{validate_skill_yaml, AppState};

#[tauri::command]
pub fn vault_list_notes(
    state: State<'_, AppState>,
) -> Result<Vec<crate::core::NoteSummary>, String> {
    state.vault_list_notes().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn vault_get_note(
    state: State<'_, AppState>,
    path: String,
) -> Result<crate::core::NoteDocument, String> {
    state
        .vault_get_note(&path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn vault_save_note(
    state: State<'_, AppState>,
    path: String,
    body_md: String,
) -> Result<crate::core::NoteDocument, String> {
    state
        .vault_save_note(&path, &body_md)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inbox_add_item(
    state: State<'_, AppState>,
    source: String,
    content_text: String,
    tags: Option<Vec<String>>,
    project_hint: Option<String>,
) -> Result<crate::core::InboxItemView, String> {
    state
        .inbox_add_item(source, content_text, tags.unwrap_or_default(), project_hint)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inbox_list(
    state: State<'_, AppState>,
    status: Option<String>,
) -> Result<Vec<crate::core::InboxItemView>, String> {
    state.inbox_list(status).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inbox_process(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<crate::core::JobRunReport, String> {
    state
        .inbox_process(limit.unwrap_or(20))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn skills_list(state: State<'_, AppState>) -> Result<Vec<crate::core::SkillRecord>, String> {
    state.skills_list().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn skills_validate(yaml: String) -> Result<crate::core::SkillValidation, String> {
    Ok(validate_skill_yaml(&yaml))
}

#[tauri::command]
pub fn skills_run(
    state: State<'_, AppState>,
    slug: String,
) -> Result<crate::core::SkillRunResult, String> {
    state.skills_run(&slug).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn planner_generate_daily(
    state: State<'_, AppState>,
) -> Result<crate::core::DailyPlan, String> {
    state
        .planner_generate_daily()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn planner_generate_weekly(
    state: State<'_, AppState>,
) -> Result<crate::core::WeeklyPlan, String> {
    state
        .planner_generate_weekly()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn focus_start(
    state: State<'_, AppState>,
    project_id: Option<String>,
    task_id: Option<String>,
) -> Result<crate::core::FocusSessionView, String> {
    state
        .focus_start(project_id, task_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn focus_stop(state: State<'_, AppState>) -> Result<crate::core::FocusSessionView, String> {
    state.focus_stop().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn focus_stats(
    state: State<'_, AppState>,
    days: Option<u32>,
) -> Result<crate::core::FocusStats, String> {
    state
        .focus_stats(days.unwrap_or(7))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn dashboard_get_overview(
    state: State<'_, AppState>,
) -> Result<crate::core::DashboardOverview, String> {
    state
        .dashboard_overview()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn projects_get_state(
    state: State<'_, AppState>,
) -> Result<Vec<crate::core::ProjectState>, String> {
    state.projects_state().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn telegram_set_config(
    state: State<'_, AppState>,
    bot_token: String,
    username: String,
) -> Result<crate::core::TelegramStatus, String> {
    state
        .telegram_set_config(bot_token, username)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn telegram_begin_verification(
    state: State<'_, AppState>,
) -> Result<crate::core::TelegramVerificationCode, String> {
    state
        .telegram_begin_verification()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn telegram_poll_once(
    state: State<'_, AppState>,
) -> Result<crate::core::TelegramPollReport, String> {
    state
        .telegram_poll_once()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn telegram_listener_start(
    state: State<'_, AppState>,
) -> Result<crate::core::TelegramStatus, String> {
    state
        .telegram_listener_start()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn telegram_listener_stop(
    state: State<'_, AppState>,
) -> Result<crate::core::TelegramStatus, String> {
    state
        .telegram_listener_stop()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn telegram_status(state: State<'_, AppState>) -> Result<crate::core::TelegramStatus, String> {
    state.telegram_status().map_err(|error| error.to_string())
}
