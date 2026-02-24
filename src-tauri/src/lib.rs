mod adapters;
mod commands;
mod core;

use serde::Serialize;
use tauri::{Emitter, Manager};

const PROTOCOL_SCHEME: &str = "snorgnote";
const INBOX_UPDATED_EVENT: &str = "snorgnote://inbox-updated";

#[derive(Debug, Clone, Serialize)]
struct InboxUpdatedEventPayload {
    item_id: String,
    source: String,
}

fn ingest_browser_deeplink_arg(app: &tauri::AppHandle, args: Vec<String>) {
    let Some(uri) = core::deeplink::extract_deeplink_from_args(args) else {
        return;
    };

    let Some(state) = app.try_state::<core::AppState>() else {
        log::warn!("deeplink received before app state initialization");
        return;
    };

    match state.ingest_browser_deeplink(&uri) {
        Ok(item) => {
            log::info!(
                "ingested browser deep-link into inbox: id={}, source={}",
                item.id,
                item.source
            );
            let payload = InboxUpdatedEventPayload {
                item_id: item.id,
                source: item.source,
            };
            if let Err(error) = app.emit(INBOX_UPDATED_EVENT, payload) {
                log::warn!("failed to emit inbox update event: {error:#}");
            }
        }
        Err(error) => {
            log::error!("failed to ingest browser deep-link `{uri}`: {error:#}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            ingest_browser_deeplink_arg(app, argv);
        }))
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

            let startup_args: Vec<String> = std::env::args().collect();
            ingest_browser_deeplink_arg(app.handle(), startup_args);

            match std::env::current_exe() {
                Ok(exe_path) => {
                    match core::protocol::ensure_protocol_registered(PROTOCOL_SCHEME, &exe_path) {
                        Ok(core::protocol::ProtocolRegistrationStatus::AlreadyRegistered) => {
                            log::info!("deeplink protocol already registered");
                        }
                        Ok(core::protocol::ProtocolRegistrationStatus::Updated) => {
                            log::info!(
                                "deeplink protocol registered for executable {}",
                                exe_path.display()
                            );
                        }
                        Ok(core::protocol::ProtocolRegistrationStatus::Skipped) => {
                            log::info!("deeplink protocol auto-registration skipped");
                        }
                        Err(error) => {
                            log::warn!(
                                "cannot register deeplink protocol automatically: {error:#}"
                            );
                        }
                    }
                }
                Err(error) => {
                    log::warn!("cannot resolve current executable path: {error:#}");
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::vault_list_notes,
            commands::vault_get_note,
            commands::vault_save_note,
            commands::vault_delete_note,
            commands::vault_trash_list,
            commands::vault_restore_note,
            commands::vault_delete_note_permanently,
            commands::vault_empty_trash,
            commands::inbox_add_item,
            commands::inbox_list,
            commands::inbox_process,
            commands::inbox_trash_item,
            commands::inbox_trash_list,
            commands::inbox_restore_item,
            commands::inbox_delete_item_permanently,
            commands::inbox_empty_trash,
            commands::skills_list,
            commands::skills_validate,
            commands::skills_run,
            commands::planner_generate_daily,
            commands::planner_generate_weekly,
            commands::focus_start,
            commands::focus_stop,
            commands::focus_pause,
            commands::focus_resume,
            commands::focus_active,
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
