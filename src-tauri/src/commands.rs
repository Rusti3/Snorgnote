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
pub fn vault_delete_note(state: State<'_, AppState>, path: String) -> Result<(), String> {
    state
        .vault_delete_note(&path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn vault_trash_list(
    state: State<'_, AppState>,
) -> Result<Vec<crate::core::TrashedNoteSummary>, String> {
    state.vault_trash_list().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn vault_restore_note(
    state: State<'_, AppState>,
    trash_id: String,
) -> Result<crate::core::NoteDocument, String> {
    state
        .vault_restore_note(&trash_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn vault_delete_note_permanently(
    state: State<'_, AppState>,
    trash_id: String,
) -> Result<(), String> {
    state
        .vault_delete_note_permanently(&trash_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn vault_empty_trash(state: State<'_, AppState>) -> Result<i64, String> {
    state.vault_empty_trash().map_err(|error| error.to_string())
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
pub fn inbox_trash_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .inbox_trash_item(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inbox_trash_list(
    state: State<'_, AppState>,
) -> Result<Vec<crate::core::TrashedInboxItem>, String> {
    state.inbox_trash_list().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inbox_restore_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<crate::core::InboxItemView, String> {
    state
        .inbox_restore_item(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inbox_delete_item_permanently(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .inbox_delete_item_permanently(&id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn inbox_empty_trash(state: State<'_, AppState>) -> Result<i64, String> {
    state.inbox_empty_trash().map_err(|error| error.to_string())
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
pub fn focus_pause(state: State<'_, AppState>) -> Result<crate::core::FocusSessionView, String> {
    state.focus_pause().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn focus_resume(state: State<'_, AppState>) -> Result<crate::core::FocusSessionView, String> {
    state.focus_resume().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn focus_active(
    state: State<'_, AppState>,
) -> Result<Option<crate::core::FocusSessionView>, String> {
    state.focus_active().map_err(|error| error.to_string())
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
pub fn focus_history(
    state: State<'_, AppState>,
    limit: Option<u32>,
    offset: Option<u32>,
    project_id: Option<String>,
    started_from: Option<String>,
    started_to: Option<String>,
) -> Result<crate::core::FocusHistoryPage, String> {
    state
        .focus_history(
            limit.unwrap_or(20),
            offset.unwrap_or(0),
            project_id,
            started_from,
            started_to,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn flashcards_create_manual(
    state: State<'_, AppState>,
    front_md: String,
    back_md: String,
) -> Result<crate::core::FlashcardView, String> {
    state
        .flashcards_create_manual(front_md, back_md)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn flashcards_create_from_notes(
    state: State<'_, AppState>,
    note_paths: Vec<String>,
) -> Result<crate::core::FlashcardsCreateFromNotesReport, String> {
    state
        .flashcards_create_from_notes(note_paths)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn flashcards_list(
    state: State<'_, AppState>,
    limit: Option<u32>,
    offset: Option<u32>,
    due_only: Option<bool>,
    query: Option<String>,
    source_note_path: Option<String>,
) -> Result<crate::core::FlashcardPage, String> {
    state
        .flashcards_list(
            limit.unwrap_or(20),
            offset.unwrap_or(0),
            due_only,
            query,
            source_note_path,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn flashcards_get(
    state: State<'_, AppState>,
    card_id: String,
) -> Result<crate::core::FlashcardView, String> {
    state
        .flashcards_get(card_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn flashcards_update(
    state: State<'_, AppState>,
    card_id: String,
    front_md: Option<String>,
    back_md: Option<String>,
    status: Option<String>,
) -> Result<crate::core::FlashcardView, String> {
    state
        .flashcards_update(card_id, front_md, back_md, status)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn flashcards_review_next(
    state: State<'_, AppState>,
) -> Result<Option<crate::core::FlashcardView>, String> {
    state
        .flashcards_review_next()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn flashcards_submit_review(
    state: State<'_, AppState>,
    card_id: String,
    grade: String,
) -> Result<crate::core::FlashcardReviewResult, String> {
    state
        .flashcards_submit_review(card_id, grade)
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
pub fn projects_list_details(
    state: State<'_, AppState>,
    project_id: Option<String>,
    notes_limit: Option<u32>,
    notes_offset: Option<u32>,
    tasks_limit: Option<u32>,
    tasks_offset: Option<u32>,
) -> Result<Vec<crate::core::ProjectDetails>, String> {
    state
        .projects_list_details(
            project_id,
            notes_limit.unwrap_or(50),
            notes_offset.unwrap_or(0),
            tasks_limit.unwrap_or(50),
            tasks_offset.unwrap_or(0),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn projects_assign_notes(
    state: State<'_, AppState>,
    project_id: String,
    note_paths: Vec<String>,
) -> Result<crate::core::ProjectAssignNotesReport, String> {
    state
        .projects_assign_notes(project_id, note_paths)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn projects_task_create(
    state: State<'_, AppState>,
    project_id: String,
    title: String,
    status: Option<String>,
    energy: Option<String>,
    due_at: Option<String>,
) -> Result<crate::core::ProjectTaskView, String> {
    state
        .projects_task_create(project_id, title, status, energy, due_at)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn projects_task_update(
    state: State<'_, AppState>,
    task_id: String,
    title: Option<String>,
    status: Option<String>,
    energy: Option<String>,
    due_at: Option<String>,
) -> Result<crate::core::ProjectTaskView, String> {
    state
        .projects_task_update(task_id, title, status, energy, due_at)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn projects_task_delete(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    state
        .projects_task_delete(task_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn habits_list(
    state: State<'_, AppState>,
    include_archived: Option<bool>,
    project_id: Option<String>,
) -> Result<Vec<crate::core::HabitView>, String> {
    state
        .habits_list(include_archived, project_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn habits_create(
    state: State<'_, AppState>,
    title: String,
    description: Option<String>,
    frequency_type: Option<String>,
    weekdays: Option<Vec<u8>>,
    interval_days: Option<u32>,
    project_id: Option<String>,
) -> Result<crate::core::HabitView, String> {
    state
        .habits_create(
            title,
            description,
            frequency_type,
            weekdays,
            interval_days,
            project_id,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn habits_update(
    state: State<'_, AppState>,
    habit_id: String,
    title: Option<String>,
    description: Option<String>,
    frequency_type: Option<String>,
    weekdays: Option<Vec<u8>>,
    interval_days: Option<u32>,
    project_id: Option<String>,
) -> Result<crate::core::HabitView, String> {
    state
        .habits_update(
            habit_id,
            title,
            description,
            frequency_type,
            weekdays,
            interval_days,
            project_id,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn habits_archive(
    state: State<'_, AppState>,
    habit_id: String,
    archived: bool,
) -> Result<crate::core::HabitView, String> {
    state
        .habits_archive(habit_id, archived)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn habits_delete(state: State<'_, AppState>, habit_id: String) -> Result<(), String> {
    state
        .habits_delete(habit_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn habits_mark_done(
    state: State<'_, AppState>,
    habit_id: String,
    date: Option<String>,
) -> Result<crate::core::HabitLogView, String> {
    state
        .habits_mark_done(habit_id, date)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn habits_unmark_done(
    state: State<'_, AppState>,
    habit_id: String,
    date: Option<String>,
) -> Result<(), String> {
    state
        .habits_unmark_done(habit_id, date)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn habits_today(
    state: State<'_, AppState>,
    date: Option<String>,
    include_archived: Option<bool>,
) -> Result<crate::core::HabitTodayPage, String> {
    state
        .habits_today(date, include_archived)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn theme_save_background_image(
    state: State<'_, AppState>,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    state
        .theme_save_background_image(file_name, bytes)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn theme_clear_background_image(state: State<'_, AppState>) -> Result<(), String> {
    state
        .theme_clear_background_image()
        .map_err(|error| error.to_string())
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
