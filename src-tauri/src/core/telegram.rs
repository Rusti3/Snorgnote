use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration as StdDuration,
};

use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    adapters::telegram::{TelegramBotApiClient, TelegramMessage, TelegramUpdate},
    core::{
        state::AppState,
        types::{TelegramPollReport, TelegramStatus, TelegramVerificationCode},
        utils::now_rfc3339,
    },
};

const SETTINGS_BOT_TOKEN: &str = "telegram.bot_token";
const SETTINGS_ALLOWED_USERNAME: &str = "telegram.allowed_username";
const CHECKPOINT_LAST_UPDATE_ID: &str = "last_update_id";
const VERIFICATION_TTL_MINUTES: i64 = 10;

#[derive(Debug, Clone)]
struct TelegramConfig {
    bot_token: String,
    username: String,
}

#[derive(Debug, Clone)]
struct TelegramBinding {
    chat_id: String,
}

#[derive(Debug, Clone)]
struct VerificationNonce {
    id: String,
    code_hash: String,
    expires_at: String,
}

#[derive(Debug, Copy, Clone, Eq, PartialEq)]
enum MessageDecision {
    Reject,
    Verify,
    Ingest,
}

impl AppState {
    pub fn telegram_set_config(
        &self,
        bot_token: String,
        username: String,
    ) -> Result<TelegramStatus> {
        let normalized_username = normalize_username(&username)?;
        let token = bot_token.trim().to_string();
        if token.is_empty() {
            bail!("telegram bot token cannot be empty");
        }

        let client = TelegramBotApiClient::new(&token)?;
        let _ = client
            .get_me()
            .context("failed to validate bot token with Telegram API")?;

        self.stop_telegram_listener_runtime();

        let conn = self.conn()?;
        set_setting(&conn, SETTINGS_BOT_TOKEN, json!(token))?;
        set_setting(&conn, SETTINGS_ALLOWED_USERNAME, json!(normalized_username))?;
        conn.execute("DELETE FROM telegram_binding", [])?;
        conn.execute(
            "DELETE FROM telegram_ingest_checkpoint WHERE key = ?1",
            params![CHECKPOINT_LAST_UPDATE_ID],
        )?;
        conn.execute(
            "UPDATE telegram_verification_nonce SET consumed_at = ?1 WHERE consumed_at IS NULL",
            params![now_rfc3339()],
        )?;

        self.set_runtime_error(None);
        self.telegram_status()
    }

    pub fn telegram_begin_verification(&self) -> Result<TelegramVerificationCode> {
        let conn = self.conn()?;
        let config = load_telegram_config(&conn)?.ok_or_else(|| {
            anyhow!("telegram is not configured: set bot token and username first")
        })?;

        let code = build_verification_code();
        let code_hash = hash_verification_code(&code);
        let now = now_rfc3339();
        let expires_at = (Utc::now() + Duration::minutes(VERIFICATION_TTL_MINUTES)).to_rfc3339();

        conn.execute(
            "UPDATE telegram_verification_nonce
             SET consumed_at = ?1
             WHERE username = ?2 AND consumed_at IS NULL",
            params![now, config.username],
        )?;
        conn.execute(
            "INSERT INTO telegram_verification_nonce (id, username, code_hash, expires_at, consumed_at, created_at)
             VALUES (?1, ?2, ?3, ?4, NULL, ?5)",
            params![Uuid::new_v4().to_string(), config.username, code_hash, expires_at, now],
        )?;

        Ok(TelegramVerificationCode { code, expires_at })
    }

    pub fn telegram_poll_once(&self) -> Result<TelegramPollReport> {
        self.telegram_poll_once_internal(2)
    }

    pub fn telegram_listener_start(&self) -> Result<TelegramStatus> {
        let conn = self.conn()?;
        let config = load_telegram_config(&conn)?.ok_or_else(|| {
            anyhow!("telegram is not configured: set bot token and username first")
        })?;
        let verified = load_binding_for_username(&conn, &config.username)?.is_some();
        if !verified {
            bail!("telegram is not verified: generate one-time code and send it to your bot");
        }

        {
            let runtime = self
                .telegram_runtime
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if runtime.running {
                drop(runtime);
                return self.telegram_status();
            }
        }

        let stop_flag = Arc::new(AtomicBool::new(false));
        let loop_stop_flag = Arc::clone(&stop_flag);
        let state = self.clone();

        let handle = thread::Builder::new()
            .name("snorgnote-telegram-listener".to_string())
            .spawn(move || {
                let mut backoff_seconds = 1_u64;
                while !loop_stop_flag.load(Ordering::Relaxed) {
                    match state.telegram_poll_once_internal(25) {
                        Ok(_) => {
                            backoff_seconds = 1;
                            if !loop_stop_flag.load(Ordering::Relaxed) {
                                thread::sleep(StdDuration::from_millis(200));
                            }
                        }
                        Err(error) => {
                            state.set_runtime_error(Some(error.to_string()));
                            thread::sleep(StdDuration::from_secs(backoff_seconds));
                            backoff_seconds = (backoff_seconds * 2).min(10);
                        }
                    }
                }
            })
            .context("failed to spawn telegram listener thread")?;

        let mut runtime = self
            .telegram_runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        runtime.running = true;
        runtime.stop_flag = Some(stop_flag);
        runtime.join_handle = Some(handle);
        runtime.last_error = None;
        drop(runtime);

        self.telegram_status()
    }

    pub fn telegram_listener_stop(&self) -> Result<TelegramStatus> {
        self.stop_telegram_listener_runtime();
        self.telegram_status()
    }

    pub fn telegram_status(&self) -> Result<TelegramStatus> {
        let conn = self.conn()?;
        let config = load_telegram_config(&conn)?;
        let username = config.as_ref().map(|cfg| cfg.username.clone());
        let binding = if let Some(username) = &username {
            load_binding_for_username(&conn, username)?
        } else {
            None
        };

        let runtime = self
            .telegram_runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        Ok(TelegramStatus {
            configured: config.is_some(),
            verified: binding.is_some(),
            running: runtime.running,
            username,
            chat_id: binding.map(|row| row.chat_id),
            last_poll_at: runtime.last_poll_at.clone(),
            last_error: runtime.last_error.clone(),
        })
    }

    fn telegram_poll_once_internal(&self, timeout_seconds: u32) -> Result<TelegramPollReport> {
        let conn = self.conn()?;
        let config = load_telegram_config(&conn)?.ok_or_else(|| {
            anyhow!("telegram is not configured: set bot token and username first")
        })?;
        let client = TelegramBotApiClient::new(&config.bot_token)?;

        let last_update_id = load_checkpoint_i64(&conn, CHECKPOINT_LAST_UPDATE_ID)?;
        let offset = last_update_id.map(|value| value + 1);
        let updates = client.get_updates(offset, timeout_seconds)?;

        let mut report = TelegramPollReport {
            fetched: 0,
            accepted: 0,
            rejected: 0,
            verified_now: false,
        };

        let mut max_update_id = last_update_id.unwrap_or(0);
        let mut binding = load_binding_for_username(&conn, &config.username)?;
        let mut active_nonce = load_active_nonce(&conn, &config.username)?;

        for update in updates {
            if update.update_id > max_update_id {
                max_update_id = update.update_id;
            }

            report.fetched += 1;

            let Some(message) = &update.message else {
                continue;
            };

            let decision = classify_message(
                message,
                &config.username,
                binding.is_some(),
                active_nonce.as_ref().map(|row| row.code_hash.as_str()),
            );

            match decision {
                MessageDecision::Reject => {
                    report.rejected += 1;
                }
                MessageDecision::Verify => {
                    let Some(from) = &message.from else {
                        report.rejected += 1;
                        continue;
                    };
                    let nonce = match &active_nonce {
                        Some(nonce) => nonce,
                        None => {
                            report.rejected += 1;
                            continue;
                        }
                    };
                    if is_expired(&nonce.expires_at)? {
                        report.rejected += 1;
                        continue;
                    }

                    upsert_binding(
                        &conn,
                        from.id.to_string(),
                        config.username.clone(),
                        message.chat.id.to_string(),
                    )?;
                    mark_nonce_consumed(&conn, &nonce.id)?;

                    binding = load_binding_for_username(&conn, &config.username)?;
                    active_nonce = None;
                    report.accepted += 1;
                    report.verified_now = true;
                }
                MessageDecision::Ingest => {
                    ingest_telegram_message(&conn, &update, message, &config.username)?;
                    report.accepted += 1;
                }
            }
        }

        if max_update_id > last_update_id.unwrap_or(0) {
            upsert_checkpoint(
                &conn,
                CHECKPOINT_LAST_UPDATE_ID,
                max_update_id.to_string().as_str(),
            )?;
        }

        self.set_runtime_poll_success();
        Ok(report)
    }

    fn stop_telegram_listener_runtime(&self) {
        let join_handle = {
            let mut runtime = self
                .telegram_runtime
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());

            if !runtime.running {
                runtime.stop_flag = None;
                runtime.join_handle = None;
                return;
            }

            if let Some(flag) = runtime.stop_flag.take() {
                flag.store(true, Ordering::Relaxed);
            }
            runtime.running = false;
            runtime.join_handle.take()
        };

        if let Some(handle) = join_handle {
            let _ = handle.join();
        }
    }

    fn set_runtime_poll_success(&self) {
        let mut runtime = self
            .telegram_runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        runtime.last_poll_at = Some(now_rfc3339());
        runtime.last_error = None;
    }

    fn set_runtime_error(&self, message: Option<String>) {
        let mut runtime = self
            .telegram_runtime
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        runtime.last_poll_at = Some(now_rfc3339());
        runtime.last_error = message;
    }
}

fn classify_message(
    message: &TelegramMessage,
    allowed_username: &str,
    verified: bool,
    active_nonce_hash: Option<&str>,
) -> MessageDecision {
    if message.chat.kind != "private" {
        return MessageDecision::Reject;
    }

    let from_username = message
        .from
        .as_ref()
        .and_then(|from| from.username.as_deref())
        .and_then(|raw| normalize_username(raw).ok());

    if from_username.as_deref() != Some(allowed_username) {
        return MessageDecision::Reject;
    }

    if verified {
        return MessageDecision::Ingest;
    }

    let Some(expected_hash) = active_nonce_hash else {
        return MessageDecision::Reject;
    };
    let Some(content) = extract_message_content(message) else {
        return MessageDecision::Reject;
    };

    if hash_verification_code(&content) == expected_hash {
        MessageDecision::Verify
    } else {
        MessageDecision::Reject
    }
}

fn extract_message_content(message: &TelegramMessage) -> Option<String> {
    message
        .text
        .clone()
        .or_else(|| message.caption.clone())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn normalize_username(raw: &str) -> Result<String> {
    let normalized = raw.trim().trim_start_matches('@').to_lowercase();
    if normalized.is_empty() {
        bail!("telegram username cannot be empty");
    }
    if normalized.len() < 5 || normalized.len() > 32 {
        bail!("telegram username must be between 5 and 32 characters");
    }
    if !normalized
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
    {
        bail!("telegram username may contain only letters, numbers and underscore");
    }
    Ok(normalized)
}

fn build_verification_code() -> String {
    let token = Uuid::new_v4().simple().to_string();
    format!("SNORG-{}", token[..6].to_uppercase())
}

fn hash_verification_code(raw: &str) -> String {
    let normalized = raw.trim().to_uppercase();
    let mut hasher = Sha256::new();
    hasher.update(normalized.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn is_expired(expires_at: &str) -> Result<bool> {
    let expires_at = DateTime::parse_from_rfc3339(expires_at)
        .with_context(|| format!("invalid verification expiry timestamp: {expires_at}"))?;
    Ok(expires_at.with_timezone(&Utc) <= Utc::now())
}

fn set_setting(conn: &Connection, key: &str, value: Value) -> Result<()> {
    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at",
        params![key, serde_json::to_string(&value)?, now_rfc3339()],
    )?;
    Ok(())
}

fn get_setting_string(conn: &Connection, key: &str) -> Result<Option<String>> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?;

    let Some(raw) = raw else {
        return Ok(None);
    };
    let value: Value = serde_json::from_str(&raw)?;
    Ok(value.as_str().map(ToString::to_string))
}

fn load_telegram_config(conn: &Connection) -> Result<Option<TelegramConfig>> {
    let bot_token = get_setting_string(conn, SETTINGS_BOT_TOKEN)?;
    let username = get_setting_string(conn, SETTINGS_ALLOWED_USERNAME)?;

    match (bot_token, username) {
        (Some(bot_token), Some(username)) => Ok(Some(TelegramConfig {
            bot_token,
            username,
        })),
        _ => Ok(None),
    }
}

fn load_binding_for_username(conn: &Connection, username: &str) -> Result<Option<TelegramBinding>> {
    conn.query_row(
        "SELECT chat_id
         FROM telegram_binding
         WHERE username = ?1
         ORDER BY verified_at DESC
         LIMIT 1",
        params![username],
        |row| {
            Ok(TelegramBinding {
                chat_id: row.get(0)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

fn load_active_nonce(conn: &Connection, username: &str) -> Result<Option<VerificationNonce>> {
    let nonce = conn
        .query_row(
            "SELECT id, code_hash, expires_at
             FROM telegram_verification_nonce
             WHERE username = ?1 AND consumed_at IS NULL
             ORDER BY created_at DESC
             LIMIT 1",
            params![username],
            |row| {
                Ok(VerificationNonce {
                    id: row.get(0)?,
                    code_hash: row.get(1)?,
                    expires_at: row.get(2)?,
                })
            },
        )
        .optional()?;

    let Some(nonce) = nonce else {
        return Ok(None);
    };

    if is_expired(&nonce.expires_at)? {
        conn.execute(
            "UPDATE telegram_verification_nonce SET consumed_at = ?1 WHERE id = ?2",
            params![now_rfc3339(), nonce.id],
        )?;
        return Ok(None);
    }

    Ok(Some(nonce))
}

fn mark_nonce_consumed(conn: &Connection, nonce_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE telegram_verification_nonce SET consumed_at = ?1 WHERE id = ?2",
        params![now_rfc3339(), nonce_id],
    )?;
    Ok(())
}

fn upsert_binding(
    conn: &Connection,
    telegram_user_id: String,
    username: String,
    chat_id: String,
) -> Result<()> {
    let now = now_rfc3339();
    conn.execute(
        "DELETE FROM telegram_binding WHERE username = ?1",
        params![username],
    )?;
    conn.execute(
        "INSERT INTO telegram_binding (id, telegram_user_id, username, chat_id, verified_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5)",
        params![Uuid::new_v4().to_string(), telegram_user_id, username, chat_id, now],
    )?;
    Ok(())
}

fn load_checkpoint_i64(conn: &Connection, key: &str) -> Result<Option<i64>> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM telegram_ingest_checkpoint WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?;
    value
        .map(|raw| {
            raw.parse::<i64>()
                .with_context(|| format!("invalid checkpoint value for key `{key}`"))
        })
        .transpose()
}

fn upsert_checkpoint(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO telegram_ingest_checkpoint (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at",
        params![key, value, now_rfc3339()],
    )?;
    Ok(())
}

fn ingest_telegram_message(
    conn: &Connection,
    update: &TelegramUpdate,
    message: &TelegramMessage,
    username: &str,
) -> Result<()> {
    let dedup_key = format!("telegram:update:{}", update.update_id);
    let dedup_exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM events WHERE dedup_key = ?1",
        params![dedup_key],
        |row| row.get(0),
    )?;
    if dedup_exists > 0 {
        return Ok(());
    }

    let now = now_rfc3339();
    let inbox_id = Uuid::new_v4().to_string();
    let payload_json = serde_json::to_string(update)?;
    let content_text = extract_message_content(message)
        .unwrap_or_else(|| "[unsupported telegram message type]".to_string());
    let tags_json = serde_json::to_string(&vec!["telegram", username])?;

    conn.execute(
      "INSERT INTO inbox_items (id, source, raw_payload_json, content_text, created_at, updated_at, status, project_hint, tags_json)
       VALUES (?1, 'telegram', ?2, ?3, ?4, ?4, 'new', NULL, ?5)",
      params![inbox_id, payload_json, content_text, now, tags_json],
    )?;

    conn.execute(
        "INSERT INTO events (id, type, entity_type, entity_id, payload_json, created_at, dedup_key)
       VALUES (?1, 'capture.received', 'inbox_item', ?2, ?3, ?4, ?5)",
        params![
            Uuid::new_v4().to_string(),
            inbox_id,
            json!({ "source": "telegram", "update_id": update.update_id }).to_string(),
            now,
            dedup_key,
        ],
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use super::{classify_message, hash_verification_code, normalize_username, MessageDecision};
    use crate::adapters::telegram::{TelegramChat, TelegramMessage, TelegramUser};

    fn sample_message(kind: &str, username: Option<&str>, text: Option<&str>) -> TelegramMessage {
        TelegramMessage {
            message_id: 1,
            date: None,
            text: text.map(ToString::to_string),
            caption: None,
            from: username.map(|value| TelegramUser {
                id: 10,
                is_bot: false,
                username: Some(value.to_string()),
                first_name: Some("Test".to_string()),
            }),
            chat: TelegramChat {
                id: 100,
                kind: kind.to_string(),
                username: None,
                title: None,
            },
        }
    }

    #[test]
    fn username_normalization_is_case_insensitive() {
        let normalized = normalize_username("@RuStI_3").expect("valid username");
        assert_eq!(normalized, "rusti_3");
    }

    #[test]
    fn username_normalization_rejects_invalid_chars() {
        let result = normalize_username("@bad-user");
        assert!(result.is_err());
    }

    #[test]
    fn verification_hash_is_stable() {
        let hash_a = hash_verification_code("snorg-abc123");
        let hash_b = hash_verification_code("  SNORG-ABC123  ");
        assert_eq!(hash_a, hash_b);
    }

    #[test]
    fn classify_rejects_non_private_chats() {
        let msg = sample_message("group", Some("rusti_3"), Some("SNORG-AAAAAA"));
        let decision = classify_message(
            &msg,
            "rusti_3",
            false,
            Some(hash_verification_code("SNORG-AAAAAA").as_str()),
        );
        assert_eq!(decision, MessageDecision::Reject);
    }

    #[test]
    fn classify_verifies_with_matching_code() {
        let msg = sample_message("private", Some("rusti_3"), Some("SNORG-AAAAAA"));
        let code_hash = hash_verification_code("SNORG-AAAAAA");
        let decision = classify_message(&msg, "rusti_3", false, Some(code_hash.as_str()));
        assert_eq!(decision, MessageDecision::Verify);
    }

    #[test]
    fn classify_ingests_after_verification() {
        let msg = sample_message("private", Some("rusti_3"), Some("capture this"));
        let decision = classify_message(&msg, "rusti_3", true, None);
        assert_eq!(decision, MessageDecision::Ingest);
    }

    #[test]
    fn expires_in_future_is_not_expired() {
        let expires_at = (Utc::now() + chrono::Duration::minutes(1)).to_rfc3339();
        let parsed = super::is_expired(&expires_at).expect("timestamp");
        assert!(!parsed);
    }
}
