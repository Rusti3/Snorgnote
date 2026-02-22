mod adapters;
mod commands;
mod core;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let state = core::AppState::bootstrap(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_list_notes,
            commands::vault_get_note,
            commands::vault_save_note,
            commands::vault_delete_note,
            commands::vault_trash_list,
            commands::vault_restore_note,
            commands::inbox_add_item,
            commands::inbox_list,
            commands::inbox_process,
            commands::inbox_trash_item,
            commands::inbox_trash_list,
            commands::inbox_restore_item,
            commands::skills_list,
            commands::skills_validate,
            commands::skills_run,
            commands::planner_generate_daily,
            commands::planner_generate_weekly,
            commands::focus_start,
            commands::focus_stop,
            commands::focus_stats,
            commands::dashboard_get_overview,
            commands::projects_get_state,
            commands::telegram_set_config,
            commands::telegram_begin_verification,
            commands::telegram_poll_once,
            commands::telegram_listener_start,
            commands::telegram_listener_stop,
            commands::telegram_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
