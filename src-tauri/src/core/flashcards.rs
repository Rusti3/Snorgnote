use std::{collections::BTreeSet, fs};

use anyhow::{anyhow, bail, Context, Result};
use chrono::{Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;
use uuid::Uuid;

use crate::core::{
    state::AppState,
    types::{FlashcardPage, FlashcardReviewResult, FlashcardView, FlashcardsCreateFromNotesReport},
    utils::now_rfc3339,
};

fn map_flashcard_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<FlashcardView> {
    Ok(FlashcardView {
        id: row.get(0)?,
        front_md: row.get(1)?,
        back_md: row.get(2)?,
        source_note_id: row.get(3)?,
        source_note_path: row.get(4)?,
        vault_path: row.get(5)?,
        status: row.get(6)?,
        is_manual: row.get::<_, i64>(7)? == 1,
        due_at: row.get(8)?,
        last_reviewed_at: row.get(9)?,
        interval_days: row.get(10)?,
        ease_factor: row.get(11)?,
        reps: row.get(12)?,
        lapses: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

fn yaml_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn is_valid_status(status: &str) -> bool {
    matches!(status, "active" | "suspended" | "archived")
}

impl AppState {
    fn flashcard_by_id(&self, conn: &Connection, card_id: &str) -> Result<FlashcardView> {
        conn.query_row(
            "SELECT
                id,
                front_md,
                back_md,
                source_note_id,
                source_note_path,
                vault_path,
                status,
                is_manual,
                due_at,
                last_reviewed_at,
                interval_days,
                ease_factor,
                reps,
                lapses,
                created_at,
                updated_at
             FROM flashcards
             WHERE id = ?1",
            params![card_id],
            map_flashcard_row,
        )
        .optional()?
        .ok_or_else(|| anyhow!("flashcard `{card_id}` not found"))
    }

    fn flashcard_to_markdown(card: &FlashcardView) -> String {
        let source_note_id = card
            .source_note_id
            .as_deref()
            .map(yaml_quote)
            .unwrap_or_else(|| "null".to_string());
        let source_note_path = card
            .source_note_path
            .as_deref()
            .map(yaml_quote)
            .unwrap_or_else(|| "null".to_string());
        let last_reviewed_at = card
            .last_reviewed_at
            .as_deref()
            .map(yaml_quote)
            .unwrap_or_else(|| "null".to_string());

        format!(
            "\
---
id: {}
source_note_id: {}
source_note_path: {}
status: {}
is_manual: {}
due_at: {}
last_reviewed_at: {}
interval_days: {}
ease_factor: {:.4}
reps: {}
lapses: {}
created_at: {}
updated_at: {}
---

# Front
{}

# Back
{}
",
            yaml_quote(&card.id),
            source_note_id,
            source_note_path,
            yaml_quote(&card.status),
            card.is_manual,
            yaml_quote(&card.due_at),
            last_reviewed_at,
            card.interval_days,
            card.ease_factor,
            card.reps,
            card.lapses,
            yaml_quote(&card.created_at),
            yaml_quote(&card.updated_at),
            card.front_md.trim_end(),
            card.back_md.trim_end()
        )
    }

    fn write_flashcard_markdown(&self, card: &FlashcardView) -> Result<()> {
        let path = self.resolve_markdown_path(&card.vault_path)?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = Self::flashcard_to_markdown(card);
        fs::write(&path, content)
            .with_context(|| format!("failed to save flashcard markdown at {}", path.display()))
    }

    fn load_note_doc_for_flashcard(
        &self,
        note_path: &str,
    ) -> Result<(String, String, String, String)> {
        let note = self.vault_get_note(note_path)?;
        Ok((note.id, note.path, note.title, note.body_md))
    }

    pub fn flashcards_create_manual(
        &self,
        front_md: String,
        back_md: String,
    ) -> Result<FlashcardView> {
        if front_md.trim().is_empty() {
            bail!("flashcard front cannot be empty");
        }
        if back_md.trim().is_empty() {
            bail!("flashcard back cannot be empty");
        }

        let conn = self.conn()?;
        let now = now_rfc3339();
        let card_id = Uuid::new_v4().to_string();
        let vault_path = format!("Flashcards/{card_id}.md");

        conn.execute(
            "INSERT INTO flashcards (
                id, front_md, back_md, source_note_id, source_note_path, vault_path, status,
                is_manual, due_at, last_reviewed_at, interval_days, ease_factor, reps, lapses, created_at, updated_at
             ) VALUES (?1, ?2, ?3, NULL, NULL, ?4, 'active', 1, ?5, NULL, 0, 2.5, 0, 0, ?5, ?5)",
            params![card_id, front_md, back_md, vault_path, now],
        )?;

        let card = self.flashcard_by_id(&conn, &card_id)?;
        if let Err(error) = self.write_flashcard_markdown(&card) {
            let _ = conn.execute("DELETE FROM flashcards WHERE id = ?1", params![card_id]);
            return Err(error);
        }

        self.insert_event(
            &conn,
            "flashcard.created",
            "flashcard",
            Some(&card.id),
            &json!({ "source": "manual", "vault_path": card.vault_path }),
        )?;

        Ok(card)
    }

    pub fn flashcards_create_from_notes(
        &self,
        note_paths: Vec<String>,
    ) -> Result<FlashcardsCreateFromNotesReport> {
        let unique_paths: BTreeSet<String> = note_paths
            .into_iter()
            .map(|path| path.trim().replace('\\', "/"))
            .filter(|path| !path.is_empty())
            .collect();
        if unique_paths.is_empty() {
            return Ok(FlashcardsCreateFromNotesReport {
                created: 0,
                skipped_existing: 0,
                items: Vec::new(),
            });
        }

        let mut source_docs = Vec::new();
        for path in unique_paths {
            source_docs.push(self.load_note_doc_for_flashcard(&path)?);
        }

        let conn = self.conn()?;
        let mut created_items = Vec::new();
        let mut skipped_existing = 0_i64;

        for (source_note_id, source_note_path, title, body_md) in source_docs {
            let existing_id = conn
                .query_row(
                    "SELECT id FROM flashcards WHERE source_note_id = ?1 LIMIT 1",
                    params![source_note_id],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            if existing_id.is_some() {
                skipped_existing += 1;
                continue;
            }

            let card_id = Uuid::new_v4().to_string();
            let now = now_rfc3339();
            let vault_path = format!("Flashcards/{card_id}.md");
            conn.execute(
                "INSERT INTO flashcards (
                    id, front_md, back_md, source_note_id, source_note_path, vault_path, status,
                    is_manual, due_at, last_reviewed_at, interval_days, ease_factor, reps, lapses, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'active', 0, ?7, NULL, 0, 2.5, 0, 0, ?7, ?7)",
                params![
                    card_id,
                    title,
                    body_md,
                    source_note_id,
                    source_note_path,
                    vault_path,
                    now
                ],
            )?;

            let card = self.flashcard_by_id(&conn, &card_id)?;
            if let Err(error) = self.write_flashcard_markdown(&card) {
                let _ = conn.execute("DELETE FROM flashcards WHERE id = ?1", params![card_id]);
                return Err(error);
            }

            self.insert_event(
                &conn,
                "flashcard.created",
                "flashcard",
                Some(&card.id),
                &json!({ "source": "note", "source_note_path": card.source_note_path }),
            )?;
            created_items.push(card);
        }

        Ok(FlashcardsCreateFromNotesReport {
            created: created_items.len() as i64,
            skipped_existing,
            items: created_items,
        })
    }

    pub fn flashcards_list(
        &self,
        limit: u32,
        offset: u32,
        due_only: Option<bool>,
        query: Option<String>,
        source_note_path: Option<String>,
    ) -> Result<FlashcardPage> {
        let conn = self.conn()?;
        let due_flag = i64::from(due_only.unwrap_or(false));
        let now = now_rfc3339();
        let source_path_filter = source_note_path.map(|path| path.trim().replace('\\', "/"));
        let query_pattern = query
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .map(|value| format!("%{value}%"));

        let total: i64 = conn.query_row(
            "SELECT COUNT(*)
             FROM flashcards
             WHERE (?1 = 0 OR due_at <= ?2)
               AND (?3 IS NULL OR source_note_path = ?3)
               AND (?4 IS NULL OR front_md LIKE ?4 OR back_md LIKE ?4)",
            params![due_flag, now, source_path_filter, query_pattern],
            |row| row.get(0),
        )?;

        let mut stmt = conn.prepare(
            "SELECT
                id,
                front_md,
                back_md,
                source_note_id,
                source_note_path,
                vault_path,
                status,
                is_manual,
                due_at,
                last_reviewed_at,
                interval_days,
                ease_factor,
                reps,
                lapses,
                created_at,
                updated_at
             FROM flashcards
             WHERE (?1 = 0 OR due_at <= ?2)
               AND (?3 IS NULL OR source_note_path = ?3)
               AND (?4 IS NULL OR front_md LIKE ?4 OR back_md LIKE ?4)
             ORDER BY due_at ASC, created_at DESC
             LIMIT ?5 OFFSET ?6",
        )?;

        let items = stmt
            .query_map(
                params![
                    due_flag,
                    now,
                    source_path_filter,
                    query_pattern,
                    i64::from(limit),
                    i64::from(offset)
                ],
                map_flashcard_row,
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(FlashcardPage {
            items,
            total,
            limit,
            offset,
        })
    }

    pub fn flashcards_get(&self, card_id: String) -> Result<FlashcardView> {
        let conn = self.conn()?;
        self.flashcard_by_id(&conn, &card_id)
    }

    pub fn flashcards_update(
        &self,
        card_id: String,
        front_md: Option<String>,
        back_md: Option<String>,
        status: Option<String>,
    ) -> Result<FlashcardView> {
        let conn = self.conn()?;
        let current = self.flashcard_by_id(&conn, &card_id)?;

        let next_front = front_md.unwrap_or(current.front_md.clone());
        let next_back = back_md.unwrap_or(current.back_md.clone());
        let next_status = status.unwrap_or(current.status.clone());
        if !is_valid_status(&next_status) {
            bail!("invalid flashcard status: `{next_status}`");
        }
        if next_front.trim().is_empty() {
            bail!("flashcard front cannot be empty");
        }
        if next_back.trim().is_empty() {
            bail!("flashcard back cannot be empty");
        }

        let updated_at = now_rfc3339();
        conn.execute(
            "UPDATE flashcards
             SET front_md = ?1, back_md = ?2, status = ?3, updated_at = ?4
             WHERE id = ?5",
            params![next_front, next_back, next_status, updated_at, card_id],
        )?;

        let updated = self.flashcard_by_id(&conn, &card_id)?;
        self.write_flashcard_markdown(&updated)?;

        self.insert_event(
            &conn,
            "flashcard.updated",
            "flashcard",
            Some(&updated.id),
            &json!({ "status": updated.status }),
        )?;

        Ok(updated)
    }

    pub fn flashcards_review_next(&self) -> Result<Option<FlashcardView>> {
        let conn = self.conn()?;
        let now = now_rfc3339();
        conn.query_row(
            "SELECT
                id,
                front_md,
                back_md,
                source_note_id,
                source_note_path,
                vault_path,
                status,
                is_manual,
                due_at,
                last_reviewed_at,
                interval_days,
                ease_factor,
                reps,
                lapses,
                created_at,
                updated_at
             FROM flashcards
             WHERE status = 'active' AND due_at <= ?1
             ORDER BY due_at ASC, created_at ASC
             LIMIT 1",
            params![now],
            map_flashcard_row,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn flashcards_submit_review(
        &self,
        card_id: String,
        grade: String,
    ) -> Result<FlashcardReviewResult> {
        let normalized_grade = grade.trim().to_lowercase();
        if !matches!(
            normalized_grade.as_str(),
            "again" | "hard" | "good" | "easy"
        ) {
            bail!("invalid flashcard grade: `{normalized_grade}`");
        }

        let conn = self.conn()?;
        let current = self.flashcard_by_id(&conn, &card_id)?;
        if current.status != "active" {
            bail!("only active flashcards can be reviewed");
        }

        let now = Utc::now();
        let reviewed_at = now.to_rfc3339();
        let mut next_ease = current.ease_factor;
        let mut next_reps = current.reps;
        let mut next_lapses = current.lapses;
        let (next_due_at, next_interval_days) = match normalized_grade.as_str() {
            "again" => {
                next_lapses += 1;
                next_reps = 0;
                next_ease = (current.ease_factor - 0.2).max(1.3);
                ((now + Duration::minutes(10)).to_rfc3339(), 0)
            }
            "hard" => {
                next_reps += 1;
                next_ease = (current.ease_factor - 0.15).max(1.3);
                let interval_days =
                    (((current.interval_days.max(1) as f64) * 1.2).round() as i64).max(1);
                (
                    (now + Duration::days(interval_days)).to_rfc3339(),
                    interval_days,
                )
            }
            "good" => {
                next_reps += 1;
                let interval_days = if next_reps == 1 {
                    1
                } else if next_reps == 2 {
                    3
                } else {
                    ((current.interval_days.max(1) as f64) * current.ease_factor).round() as i64
                }
                .max(1);
                (
                    (now + Duration::days(interval_days)).to_rfc3339(),
                    interval_days,
                )
            }
            "easy" => {
                next_reps += 1;
                next_ease = current.ease_factor + 0.15;
                let interval_days = if next_reps == 1 {
                    4
                } else {
                    ((current.interval_days.max(1) as f64) * next_ease * 1.3).round() as i64
                }
                .max(1);
                (
                    (now + Duration::days(interval_days)).to_rfc3339(),
                    interval_days,
                )
            }
            _ => unreachable!(),
        };

        conn.execute(
            "UPDATE flashcards
             SET due_at = ?1,
                 last_reviewed_at = ?2,
                 interval_days = ?3,
                 ease_factor = ?4,
                 reps = ?5,
                 lapses = ?6,
                 updated_at = ?2
             WHERE id = ?7",
            params![
                next_due_at,
                reviewed_at,
                next_interval_days,
                next_ease,
                next_reps,
                next_lapses,
                card_id
            ],
        )?;

        conn.execute(
            "INSERT INTO flashcard_reviews (
                id, card_id, grade, reviewed_at, prev_due_at, next_due_at, prev_interval_days, next_interval_days
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                current.id,
                normalized_grade,
                reviewed_at,
                current.due_at,
                next_due_at,
                current.interval_days,
                next_interval_days
            ],
        )?;

        let updated = self.flashcard_by_id(&conn, &card_id)?;
        self.write_flashcard_markdown(&updated)?;
        self.insert_event(
            &conn,
            "flashcard.reviewed",
            "flashcard",
            Some(&updated.id),
            &json!({ "grade": normalized_grade }),
        )?;

        Ok(FlashcardReviewResult {
            grade: normalized_grade,
            card: updated,
        })
    }

    #[cfg(test)]
    pub fn flashcards_set_due_at(&self, card_id: String, due_at: String) -> Result<()> {
        let conn = self.conn()?;
        let updated_at = now_rfc3339();
        conn.execute(
            "UPDATE flashcards SET due_at = ?1, updated_at = ?2 WHERE id = ?3",
            params![due_at, updated_at, card_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use chrono::{Duration, Utc};
    use tempfile::tempdir;

    use crate::core::state::AppState;

    #[test]
    fn flashcards_create_manual_persists_and_writes_markdown() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let created = state.flashcards_create_manual(
            "What is Rust?".to_string(),
            "A systems language.".to_string(),
        )?;

        assert_eq!(created.front_md, "What is Rust?");
        assert_eq!(created.back_md, "A systems language.");
        assert_eq!(created.status, "active");
        assert!(created.vault_path.starts_with("Flashcards/"));

        let conn = state.conn()?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM flashcards WHERE id = ?1",
            rusqlite::params![created.id],
            |row| row.get(0),
        )?;
        assert_eq!(count, 1);

        let abs_path = state.resolve_markdown_path(&created.vault_path)?;
        let content = std::fs::read_to_string(abs_path)?;
        assert!(content.contains("# Front"));
        assert!(content.contains("# Back"));

        Ok(())
    }

    #[test]
    fn flashcards_create_from_notes_creates_one_card_per_note() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let _ = state.vault_save_note("Notes/src-a.md", "# Card A\n\nA body")?;
        let _ = state.vault_save_note("Notes/src-b.md", "# Card B\n\nB body")?;

        let report = state.flashcards_create_from_notes(vec![
            "Notes/src-a.md".to_string(),
            "Notes/src-b.md".to_string(),
        ])?;

        assert_eq!(report.created, 2);
        assert_eq!(report.skipped_existing, 0);
        assert_eq!(report.items.len(), 2);
        assert!(report
            .items
            .iter()
            .all(|item| item.source_note_id.is_some()));
        assert!(report
            .items
            .iter()
            .all(|item| item.source_note_path.is_some()));

        Ok(())
    }

    #[test]
    fn flashcards_create_from_notes_skips_existing_cards_by_source_note() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let _ = state.vault_save_note("Notes/src-c.md", "# Card C\n\nBody")?;

        let first = state.flashcards_create_from_notes(vec!["Notes/src-c.md".to_string()])?;
        assert_eq!(first.created, 1);
        assert_eq!(first.skipped_existing, 0);

        let second = state.flashcards_create_from_notes(vec!["Notes/src-c.md".to_string()])?;
        assert_eq!(second.created, 0);
        assert_eq!(second.skipped_existing, 1);
        assert!(second.items.is_empty());

        Ok(())
    }

    #[test]
    fn flashcards_review_again_resets_repetition_and_sets_short_due() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let card = state.flashcards_create_manual("Q".to_string(), "A".to_string())?;
        let now = Utc::now();
        let result = state.flashcards_submit_review(card.id.clone(), "again".to_string())?;

        assert_eq!(result.grade, "again");
        assert_eq!(result.card.reps, 0);
        assert_eq!(result.card.interval_days, 0);
        assert!(result.card.lapses >= 1);

        let due = chrono::DateTime::parse_from_rfc3339(&result.card.due_at)?.with_timezone(&Utc);
        assert!(due >= now + Duration::minutes(9));
        assert!(due <= now + Duration::minutes(11));

        Ok(())
    }

    #[test]
    fn flashcards_review_good_and_easy_progress_schedule() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let card = state.flashcards_create_manual("Question".to_string(), "Answer".to_string())?;

        let good = state.flashcards_submit_review(card.id.clone(), "good".to_string())?;
        assert_eq!(good.grade, "good");
        assert!(good.card.interval_days >= 1);
        let ease_after_good = good.card.ease_factor;

        let easy = state.flashcards_submit_review(card.id.clone(), "easy".to_string())?;
        assert_eq!(easy.grade, "easy");
        assert!(easy.card.interval_days >= good.card.interval_days);
        assert!(easy.card.ease_factor >= ease_after_good);

        Ok(())
    }

    #[test]
    fn flashcards_review_next_returns_only_due_active_cards() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let due_card = state.flashcards_create_manual("Due".to_string(), "Now".to_string())?;
        let future_card =
            state.flashcards_create_manual("Future".to_string(), "Later".to_string())?;
        state.flashcards_set_due_at(
            future_card.id.clone(),
            (Utc::now() + Duration::days(2)).to_rfc3339(),
        )?;

        let next = state.flashcards_review_next()?.expect("due card expected");
        assert_eq!(next.id, due_card.id);
        assert_eq!(next.status, "active");

        Ok(())
    }
}
