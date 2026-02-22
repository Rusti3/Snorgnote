use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Component, Path, PathBuf},
    sync::{atomic::AtomicBool, Arc, Mutex},
    thread::JoinHandle,
    time::{Duration as StdDuration, Instant, UNIX_EPOCH},
};

use anyhow::{anyhow, bail, Context, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use tauri::Manager;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::core::{
    db::{init_schema, BUILTIN_SKILLS, DEFAULT_PROJECT_ID},
    types::{
        InboxItemView, JobRunReport, NoteDocument, NoteSummary, SkillConfig, SkillRecord,
        SkillRunResult, TrashedInboxItem, TrashedNoteSummary,
    },
    utils::{
        extract_title, extract_wiki_links, normalize_job_type, now_rfc3339, parse_frontmatter,
        parse_tags_json, tags_from_frontmatter,
    },
};

pub struct TelegramRuntime {
    pub running: bool,
    pub stop_flag: Option<Arc<AtomicBool>>,
    pub join_handle: Option<JoinHandle<()>>,
    pub last_poll_at: Option<String>,
    pub last_error: Option<String>,
}

impl Default for TelegramRuntime {
    fn default() -> Self {
        Self {
            running: false,
            stop_flag: None,
            join_handle: None,
            last_poll_at: None,
            last_error: None,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub vault_root: PathBuf,
    pub db_path: PathBuf,
    pub telegram_runtime: Arc<Mutex<TelegramRuntime>>,
    pub last_reindex_at: Arc<Mutex<Option<Instant>>>,
}

const TRASH_ROOT_DIR: &str = ".snorgnote_trash";
const TRASH_NOTES_DIR: &str = ".snorgnote_trash/notes";
const REINDEX_DEBOUNCE_WINDOW: StdDuration = StdDuration::from_millis(800);

impl AppState {
    pub fn bootstrap(app: &tauri::AppHandle) -> Result<Self> {
        let base_dir = match std::env::var("SNORGNOTE_DATA_DIR") {
            Ok(path) => PathBuf::from(path),
            Err(_) => app
                .path()
                .app_data_dir()
                .context("cannot resolve app data dir")?,
        };

        fs::create_dir_all(&base_dir)?;
        let state = Self {
            vault_root: base_dir.join("vault"),
            db_path: base_dir.join("snorgnote.db"),
            telegram_runtime: Arc::new(Mutex::new(TelegramRuntime::default())),
            last_reindex_at: Arc::new(Mutex::new(None)),
        };
        state.init()?;
        Ok(state)
    }

    #[cfg(test)]
    pub fn for_test(base_dir: &Path) -> Result<Self> {
        fs::create_dir_all(base_dir)?;
        let state = Self {
            vault_root: base_dir.join("vault"),
            db_path: base_dir.join("snorgnote.db"),
            telegram_runtime: Arc::new(Mutex::new(TelegramRuntime::default())),
            last_reindex_at: Arc::new(Mutex::new(None)),
        };
        state.init()?;
        Ok(state)
    }

    pub(crate) fn conn(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)
            .with_context(|| format!("cannot open database at {}", self.db_path.display()))?;
        conn.busy_timeout(StdDuration::from_secs(3))?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        Ok(conn)
    }

    fn init(&self) -> Result<()> {
        fs::create_dir_all(&self.vault_root)?;
        let conn = self.conn()?;
        init_schema(&conn)?;
        self.seed_defaults(&conn)?;
        self.reindex_vault_if_due(&conn, true)?;
        Ok(())
    }

    fn reindex_vault_if_due(&self, conn: &Connection, force: bool) -> Result<()> {
        let should_run = if force {
            true
        } else {
            let guard = self
                .last_reindex_at
                .lock()
                .map_err(|_| anyhow!("reindex state lock poisoned"))?;
            match *guard {
                Some(last) => last.elapsed() >= REINDEX_DEBOUNCE_WINDOW,
                None => true,
            }
        };

        if !should_run {
            return Ok(());
        }

        self.reindex_vault(conn)?;
        let mut guard = self
            .last_reindex_at
            .lock()
            .map_err(|_| anyhow!("reindex state lock poisoned"))?;
        *guard = Some(Instant::now());
        Ok(())
    }

    fn seed_defaults(&self, conn: &Connection) -> Result<()> {
        let now = now_rfc3339();
        conn.execute(
      "INSERT OR IGNORE INTO projects (id, slug, name, biome_type, health, xp, level, created_at, updated_at)
       VALUES (?1, 'general', 'General', 'mainland', 50, 0, 1, ?2, ?2)",
      params![DEFAULT_PROJECT_ID, now],
    )?;
        conn.execute(
      "INSERT OR IGNORE INTO projects (id, slug, name, biome_type, health, xp, level, created_at, updated_at)
       VALUES ('project_life', 'life', 'Life', 'habitat', 55, 0, 1, ?1, ?1)",
      params![now],
    )?;

        for (slug, yaml) in BUILTIN_SKILLS {
            let config: SkillConfig = serde_yaml::from_str(yaml)
                .with_context(|| format!("invalid built-in skill config for slug `{slug}`"))?;
            conn.execute(
        "INSERT INTO skills (id, slug, version, config_yaml, enabled, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(slug) DO UPDATE SET
           version = excluded.version,
           config_yaml = excluded.config_yaml,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at",
        params![
          config.id,
          slug,
          i64::from(config.version),
          *yaml,
          if config.enabled { 1 } else { 0 },
          now,
        ],
      )?;
        }

        Ok(())
    }

    pub(crate) fn resolve_markdown_path(&self, rel_path: &str) -> Result<PathBuf> {
        let normalized = rel_path.replace('\\', "/").trim().to_string();
        if normalized.is_empty() {
            bail!("note path cannot be empty");
        }
        if !normalized.to_lowercase().ends_with(".md") {
            bail!("only markdown files are allowed: `{normalized}`");
        }

        let path = Path::new(&normalized);
        if path.is_absolute() {
            bail!("absolute paths are not allowed");
        }
        for component in path.components() {
            if matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            ) {
                bail!("path traversal is not allowed");
            }
        }

        Ok(self.vault_root.join(path))
    }

    pub(crate) fn reindex_vault(&self, conn: &Connection) -> Result<()> {
        if !self.vault_root.exists() {
            return Ok(());
        }

        let mut indexed_state = HashMap::new();
        {
            let mut stmt =
                conn.prepare("SELECT path, mtime_ms, size_bytes FROM vault_index_state")?;
            let rows = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?;
            for row in rows {
                let (path, mtime_ms, size_bytes) = row?;
                indexed_state.insert(path, (mtime_ms, size_bytes));
            }
        }

        let mut seen_paths = HashSet::new();
        for entry in WalkDir::new(&self.vault_root)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().is_file())
        {
            let is_markdown = entry
                .path()
                .extension()
                .and_then(|ext| ext.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("md"));
            if !is_markdown {
                continue;
            }

            let rel_path = entry
                .path()
                .strip_prefix(&self.vault_root)
                .context("cannot compute relative path")?
                .to_string_lossy()
                .replace('\\', "/");
            if is_trash_rel_path(&rel_path) {
                continue;
            }

            seen_paths.insert(rel_path.clone());

            let metadata = entry.metadata()?;
            let size_bytes = metadata.len() as i64;
            let mtime_ms = file_mtime_ms(&metadata)?;
            let should_reindex = match indexed_state.get(&rel_path) {
                Some((indexed_mtime, indexed_size)) => {
                    *indexed_mtime != mtime_ms || *indexed_size != size_bytes
                }
                None => true,
            };

            if should_reindex {
                let body = fs::read_to_string(entry.path()).unwrap_or_default();
                let _ = self.upsert_note_from_body(conn, &rel_path, &body, None)?;
                self.upsert_index_state(conn, &rel_path, mtime_ms, size_bytes)?;
            }
        }

        for stale_path in indexed_state
            .keys()
            .filter(|path| !seen_paths.contains(*path))
        {
            conn.execute(
                "DELETE FROM vault_index_state WHERE path = ?1",
                params![stale_path],
            )?;

            let note_id = conn
                .query_row(
                    "SELECT id FROM notes WHERE path = ?1",
                    params![stale_path],
                    |row| row.get::<_, String>(0),
                )
                .optional()?;
            if let Some(note_id) = note_id {
                conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
                conn.execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
            }
        }

        Ok(())
    }

    pub fn vault_list_notes(&self) -> Result<Vec<NoteSummary>> {
        let conn = self.conn()?;
        self.reindex_vault_if_due(&conn, false)?;

        let mut stmt = conn.prepare(
            "SELECT id, path, title, updated_at
       FROM notes
       ORDER BY updated_at DESC, path ASC",
        )?;

        let notes = stmt
            .query_map([], |row| {
                Ok(NoteSummary {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    title: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(notes)
    }

    pub fn vault_get_note(&self, rel_path: &str) -> Result<NoteDocument> {
        let abs_path = self.resolve_markdown_path(rel_path)?;
        let body = fs::read_to_string(&abs_path)
            .with_context(|| format!("note does not exist: {}", abs_path.display()))?;
        let conn = self.conn()?;
        let note_id = self.upsert_note_from_body(&conn, rel_path, &body, None)?;
        let metadata = fs::metadata(&abs_path)?;
        self.upsert_index_state(
            &conn,
            &rel_path.replace('\\', "/"),
            file_mtime_ms(&metadata)?,
            metadata.len() as i64,
        )?;
        let (frontmatter, _) = parse_frontmatter(&body);

        Ok(NoteDocument {
            id: note_id,
            path: rel_path.replace('\\', "/"),
            title: extract_title(&body, rel_path),
            body_md: body,
            frontmatter,
            updated_at: now_rfc3339(),
        })
    }

    pub fn vault_save_note(&self, rel_path: &str, body_md: &str) -> Result<NoteDocument> {
        let abs_path = self.resolve_markdown_path(rel_path)?;
        if let Some(parent) = abs_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&abs_path, body_md)
            .with_context(|| format!("failed to save note at {}", abs_path.display()))?;

        let conn = self.conn()?;
        let source_ref = Some(format!("vault:{rel_path}"));
        let note_id =
            self.upsert_note_from_body(&conn, rel_path, body_md, source_ref.as_deref())?;
        let metadata = fs::metadata(&abs_path)?;
        self.upsert_index_state(
            &conn,
            &rel_path.replace('\\', "/"),
            file_mtime_ms(&metadata)?,
            metadata.len() as i64,
        )?;
        let (frontmatter, _) = parse_frontmatter(body_md);

        self.insert_event(
            &conn,
            "note.saved",
            "note",
            Some(&note_id),
            &json!({ "path": rel_path }),
        )?;

        Ok(NoteDocument {
            id: note_id,
            path: rel_path.replace('\\', "/"),
            title: extract_title(body_md, rel_path),
            body_md: body_md.to_string(),
            frontmatter,
            updated_at: now_rfc3339(),
        })
    }

    pub fn vault_delete_note(&self, rel_path: &str) -> Result<()> {
        let abs_path = self.resolve_markdown_path(rel_path)?;
        if !abs_path.exists() {
            bail!("note does not exist: {}", abs_path.display());
        }

        let clean_path = rel_path.replace('\\', "/");
        let conn = self.conn()?;

        let note_meta = conn
            .query_row(
                "SELECT id, title FROM notes WHERE path = ?1",
                params![clean_path],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        let (note_id, title) = match note_meta {
            Some((note_id, title)) => (Some(note_id), title),
            None => (
                None,
                extract_title(&fs::read_to_string(&abs_path)?, &clean_path),
            ),
        };

        let trash_id = Uuid::new_v4().to_string();
        let trashed_rel_path = format!("{TRASH_NOTES_DIR}/{trash_id}.md");
        let trashed_abs_path = self.vault_root.join(&trashed_rel_path);
        if let Some(parent) = trashed_abs_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&abs_path, &trashed_abs_path).with_context(|| {
            format!(
                "failed to move note to trash: {} -> {}",
                abs_path.display(),
                trashed_abs_path.display()
            )
        })?;

        let deleted_at = now_rfc3339();
        conn.execute(
            "INSERT INTO notes_trash (id, note_id, title, original_path, trashed_path, deleted_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                trash_id,
                note_id.clone(),
                title,
                clean_path.clone(),
                trashed_rel_path,
                deleted_at
            ],
        )?;

        conn.execute(
            "DELETE FROM vault_index_state WHERE path = ?1",
            params![clean_path],
        )?;
        if let Some(note_id) = note_id {
            conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
            conn.execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
        } else {
            conn.execute("DELETE FROM notes WHERE path = ?1", params![clean_path])?;
        }

        self.insert_event(
            &conn,
            "note.trashed",
            "note",
            None,
            &json!({ "path": clean_path }),
        )?;
        Ok(())
    }

    pub fn vault_trash_list(&self) -> Result<Vec<TrashedNoteSummary>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, title, original_path, deleted_at
             FROM notes_trash
             ORDER BY deleted_at DESC
             LIMIT 500",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(TrashedNoteSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                original_path: row.get(2)?,
                deleted_at: row.get(3)?,
            })
        })?;

        let mut list = Vec::new();
        for row in rows {
            list.push(row?);
        }
        Ok(list)
    }

    pub fn vault_restore_note(&self, trash_id: &str) -> Result<NoteDocument> {
        let conn = self.conn()?;
        let row = conn
            .query_row(
                "SELECT original_path, trashed_path, title FROM notes_trash WHERE id = ?1",
                params![trash_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| anyhow!("trash entry `{trash_id}` not found"))?;
        let (original_path, trashed_path, title) = row;

        let trashed_abs_path = self.vault_root.join(&trashed_path);
        if !trashed_abs_path.exists() {
            bail!(
                "trashed note file does not exist: {}",
                trashed_abs_path.display()
            );
        }

        let mut target_rel_path = original_path.clone();
        let mut target_abs_path = self.resolve_markdown_path(&target_rel_path)?;
        if target_abs_path.exists() {
            target_rel_path = build_restored_rel_path(&original_path);
            target_abs_path = self.resolve_markdown_path(&target_rel_path)?;
        }

        if let Some(parent) = target_abs_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&trashed_abs_path, &target_abs_path).with_context(|| {
            format!(
                "failed to restore note from trash: {} -> {}",
                trashed_abs_path.display(),
                target_abs_path.display()
            )
        })?;

        let body = fs::read_to_string(&target_abs_path)?;
        let source_ref = format!("vault:{target_rel_path}");
        let note_id =
            self.upsert_note_from_body(&conn, &target_rel_path, &body, Some(&source_ref))?;
        let metadata = fs::metadata(&target_abs_path)?;
        self.upsert_index_state(
            &conn,
            &target_rel_path,
            file_mtime_ms(&metadata)?,
            metadata.len() as i64,
        )?;
        conn.execute("DELETE FROM notes_trash WHERE id = ?1", params![trash_id])?;

        self.insert_event(
            &conn,
            "note.restored",
            "note",
            Some(&note_id),
            &json!({ "path": target_rel_path }),
        )?;

        let (frontmatter, _) = parse_frontmatter(&body);
        Ok(NoteDocument {
            id: note_id,
            path: target_rel_path,
            title,
            body_md: body,
            frontmatter,
            updated_at: now_rfc3339(),
        })
    }

    pub fn vault_delete_note_permanently(&self, trash_id: &str) -> Result<()> {
        let conn = self.conn()?;
        let row = conn
            .query_row(
                "SELECT original_path, trashed_path FROM notes_trash WHERE id = ?1",
                params![trash_id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?
            .ok_or_else(|| anyhow!("trash entry `{trash_id}` not found"))?;
        let (original_path, trashed_path) = row;

        let trashed_abs_path = self.resolve_markdown_path(&trashed_path)?;
        if trashed_abs_path.exists() {
            fs::remove_file(&trashed_abs_path).with_context(|| {
                format!(
                    "failed to permanently delete trashed note file `{}`",
                    trashed_abs_path.display()
                )
            })?;
        }

        conn.execute("DELETE FROM notes_trash WHERE id = ?1", params![trash_id])?;
        self.insert_event(
            &conn,
            "note.deleted_permanently",
            "note",
            None,
            &json!({ "path": original_path }),
        )?;
        Ok(())
    }

    pub fn vault_empty_trash(&self) -> Result<i64> {
        let trash_ids = {
            let conn = self.conn()?;
            let mut stmt = conn.prepare("SELECT id FROM notes_trash ORDER BY deleted_at ASC")?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };

        for trash_id in &trash_ids {
            self.vault_delete_note_permanently(trash_id)?;
        }

        Ok(trash_ids.len() as i64)
    }

    pub(crate) fn upsert_note_from_body(
        &self,
        conn: &Connection,
        rel_path: &str,
        body_md: &str,
        source_ref: Option<&str>,
    ) -> Result<String> {
        let clean_path = rel_path.replace('\\', "/");
        let existing_id = conn
            .query_row(
                "SELECT id FROM notes WHERE path = ?1",
                params![clean_path],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        let note_id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let (frontmatter, content_without_frontmatter) = parse_frontmatter(body_md);
        let title = extract_title(&content_without_frontmatter, rel_path);
        let tags_text = tags_from_frontmatter(&frontmatter).join(" ");
        let frontmatter_json = serde_json::to_string(&frontmatter)?;
        let now = now_rfc3339();

        conn.execute(
      "INSERT INTO notes (id, path, title, body_md, frontmatter_json, source_ref, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
       ON CONFLICT(path) DO UPDATE SET
         title = excluded.title,
         body_md = excluded.body_md,
         frontmatter_json = excluded.frontmatter_json,
         source_ref = COALESCE(excluded.source_ref, notes.source_ref),
         updated_at = excluded.updated_at",
      params![note_id, clean_path, title, body_md, frontmatter_json, source_ref, now],
    )?;

        conn.execute("DELETE FROM notes_fts WHERE note_id = ?1", params![note_id])?;
        conn.execute(
            "INSERT INTO notes_fts (note_id, title, body_md, tags_text)
       VALUES (?1, ?2, ?3, ?4)",
            params![
                note_id,
                extract_title(body_md, rel_path),
                body_md,
                tags_text
            ],
        )?;

        conn.execute(
            "DELETE FROM note_links WHERE from_note_id = ?1",
            params![note_id],
        )?;
        for target in extract_wiki_links(&content_without_frontmatter) {
            conn.execute(
                "INSERT INTO note_links (id, from_note_id, to_path, link_type)
         VALUES (?1, ?2, ?3, 'wiki')",
                params![Uuid::new_v4().to_string(), note_id, target],
            )?;
        }

        Ok(note_id)
    }

    fn upsert_index_state(
        &self,
        conn: &Connection,
        rel_path: &str,
        mtime_ms: i64,
        size_bytes: i64,
    ) -> Result<()> {
        conn.execute(
            "INSERT INTO vault_index_state (path, mtime_ms, size_bytes, last_indexed_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(path) DO UPDATE SET
               mtime_ms = excluded.mtime_ms,
               size_bytes = excluded.size_bytes,
               last_indexed_at = excluded.last_indexed_at",
            params![rel_path, mtime_ms, size_bytes, now_rfc3339()],
        )?;
        Ok(())
    }

    pub fn inbox_add_item(
        &self,
        source: String,
        content_text: String,
        tags: Vec<String>,
        project_hint: Option<String>,
    ) -> Result<InboxItemView> {
        let conn = self.conn()?;
        let id = Uuid::new_v4().to_string();
        let now = now_rfc3339();
        let tags_json = serde_json::to_string(&tags)?;

        conn.execute(
      "INSERT INTO inbox_items (id, source, raw_payload_json, content_text, created_at, updated_at, status, project_hint, tags_json)
       VALUES (?1, ?2, '{}', ?3, ?4, ?4, 'new', ?5, ?6)",
      params![id, source, content_text, now, project_hint, tags_json],
    )?;

        self.insert_event(
            &conn,
            "capture.received",
            "inbox_item",
            Some(&id),
            &json!({ "source": source }),
        )?;

        Ok(InboxItemView {
            id,
            source,
            content_text,
            created_at: now,
            status: "new".to_string(),
            project_hint,
            tags,
        })
    }

    pub fn inbox_list(&self, status: Option<String>) -> Result<Vec<InboxItemView>> {
        let conn = self.conn()?;
        let mut items = Vec::new();

        if let Some(status) = status {
            let mut stmt = conn.prepare(
                "SELECT id, source, content_text, created_at, status, project_hint, tags_json
         FROM inbox_items
         WHERE status = ?1
         ORDER BY created_at DESC
         LIMIT 200",
            )?;
            let rows = stmt.query_map(params![status], |row| {
                let tags_json: String = row.get(6)?;
                Ok(InboxItemView {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    content_text: row.get(2)?,
                    created_at: row.get(3)?,
                    status: row.get(4)?,
                    project_hint: row.get(5)?,
                    tags: parse_tags_json(&tags_json),
                })
            })?;
            for row in rows {
                items.push(row?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, source, content_text, created_at, status, project_hint, tags_json
         FROM inbox_items
         WHERE status != 'trashed'
         ORDER BY created_at DESC
         LIMIT 200",
            )?;
            let rows = stmt.query_map([], |row| {
                let tags_json: String = row.get(6)?;
                Ok(InboxItemView {
                    id: row.get(0)?,
                    source: row.get(1)?,
                    content_text: row.get(2)?,
                    created_at: row.get(3)?,
                    status: row.get(4)?,
                    project_hint: row.get(5)?,
                    tags: parse_tags_json(&tags_json),
                })
            })?;
            for row in rows {
                items.push(row?);
            }
        }

        Ok(items)
    }

    pub fn inbox_trash_item(&self, inbox_id: &str) -> Result<()> {
        let conn = self.conn()?;
        let previous_status = conn
            .query_row(
                "SELECT status FROM inbox_items WHERE id = ?1",
                params![inbox_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| anyhow!("inbox item `{inbox_id}` not found"))?;

        if previous_status == "trashed" {
            return Ok(());
        }

        let deleted_at = now_rfc3339();
        conn.execute(
            "INSERT INTO inbox_trash (inbox_item_id, previous_status, deleted_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(inbox_item_id) DO UPDATE SET
               previous_status = excluded.previous_status,
               deleted_at = excluded.deleted_at",
            params![inbox_id, previous_status, deleted_at],
        )?;
        conn.execute(
            "UPDATE inbox_items SET status = 'trashed', updated_at = ?1 WHERE id = ?2",
            params![deleted_at, inbox_id],
        )?;

        self.insert_event(
            &conn,
            "inbox.trashed",
            "inbox_item",
            Some(inbox_id),
            &json!({}),
        )?;
        Ok(())
    }

    pub fn inbox_trash_list(&self) -> Result<Vec<TrashedInboxItem>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT
               i.id,
               i.source,
               i.content_text,
               i.created_at,
               t.deleted_at,
               i.tags_json,
               t.previous_status
             FROM inbox_items i
             JOIN inbox_trash t ON t.inbox_item_id = i.id
             ORDER BY t.deleted_at DESC
             LIMIT 500",
        )?;

        let rows = stmt.query_map([], |row| {
            let tags_json: String = row.get(5)?;
            Ok(TrashedInboxItem {
                id: row.get(0)?,
                source: row.get(1)?,
                content_text: row.get(2)?,
                created_at: row.get(3)?,
                deleted_at: row.get(4)?,
                tags: parse_tags_json(&tags_json),
                previous_status: row.get(6)?,
            })
        })?;

        let mut list = Vec::new();
        for row in rows {
            list.push(row?);
        }
        Ok(list)
    }

    pub fn inbox_restore_item(&self, inbox_id: &str) -> Result<InboxItemView> {
        let conn = self.conn()?;
        let previous_status = conn
            .query_row(
                "SELECT previous_status FROM inbox_trash WHERE inbox_item_id = ?1",
                params![inbox_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| anyhow!("inbox item `{inbox_id}` is not in trash"))?;

        conn.execute(
            "UPDATE inbox_items SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![previous_status, now_rfc3339(), inbox_id],
        )?;
        conn.execute(
            "DELETE FROM inbox_trash WHERE inbox_item_id = ?1",
            params![inbox_id],
        )?;

        self.insert_event(
            &conn,
            "inbox.restored",
            "inbox_item",
            Some(inbox_id),
            &json!({}),
        )?;

        let item = conn
            .query_row(
                "SELECT id, source, content_text, created_at, status, project_hint, tags_json
                 FROM inbox_items
                 WHERE id = ?1",
                params![inbox_id],
                |row| {
                    let tags_json: String = row.get(6)?;
                    Ok(InboxItemView {
                        id: row.get(0)?,
                        source: row.get(1)?,
                        content_text: row.get(2)?,
                        created_at: row.get(3)?,
                        status: row.get(4)?,
                        project_hint: row.get(5)?,
                        tags: parse_tags_json(&tags_json),
                    })
                },
            )
            .optional()?
            .ok_or_else(|| anyhow!("inbox item `{inbox_id}` not found after restore"))?;

        Ok(item)
    }

    pub fn inbox_delete_item_permanently(&self, inbox_id: &str) -> Result<()> {
        let conn = self.conn()?;
        let exists_in_trash = conn
            .query_row(
                "SELECT 1 FROM inbox_trash WHERE inbox_item_id = ?1",
                params![inbox_id],
                |row| row.get::<_, i64>(0),
            )
            .optional()?
            .is_some();
        if !exists_in_trash {
            bail!("inbox item `{inbox_id}` is not in trash");
        }

        let deleted = conn.execute("DELETE FROM inbox_items WHERE id = ?1", params![inbox_id])?;
        if deleted == 0 {
            bail!("inbox item `{inbox_id}` not found");
        }

        self.insert_event(
            &conn,
            "inbox.deleted_permanently",
            "inbox_item",
            Some(inbox_id),
            &json!({}),
        )?;
        Ok(())
    }

    pub fn inbox_empty_trash(&self) -> Result<i64> {
        let trashed_ids = {
            let conn = self.conn()?;
            let mut stmt =
                conn.prepare("SELECT inbox_item_id FROM inbox_trash ORDER BY deleted_at ASC")?;
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            rows
        };

        for inbox_id in &trashed_ids {
            self.inbox_delete_item_permanently(inbox_id)?;
        }

        Ok(trashed_ids.len() as i64)
    }

    pub fn inbox_process(&self, limit: u32) -> Result<JobRunReport> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id
       FROM inbox_items
       WHERE status = 'new'
       ORDER BY created_at ASC
       LIMIT ?1",
        )?;

        let inbox_ids = stmt
            .query_map(params![i64::from(limit)], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        for inbox_id in &inbox_ids {
            self.enqueue_job(&conn, None, "summarize", Some(inbox_id.as_str()), 5)?;
            self.enqueue_job(&conn, None, "extract_tasks", Some(inbox_id.as_str()), 4)?;
            self.enqueue_job(&conn, None, "tag", Some(inbox_id.as_str()), 3)?;
            conn.execute(
                "UPDATE inbox_items SET status = 'queued', updated_at = ?1 WHERE id = ?2",
                params![now_rfc3339(), inbox_id],
            )?;
        }

        drop(stmt);
        drop(conn);

        self.run_pending_jobs(limit.saturating_mul(5))
    }

    pub fn skills_list(&self) -> Result<Vec<SkillRecord>> {
        let conn = self.conn()?;
        let mut stmt = conn.prepare(
            "SELECT id, slug, version, enabled
       FROM skills
       ORDER BY slug ASC",
        )?;

        let skills = stmt
            .query_map([], |row| {
                Ok(SkillRecord {
                    id: row.get(0)?,
                    slug: row.get(1)?,
                    version: row.get(2)?,
                    enabled: row.get::<_, i64>(3)? == 1,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(skills)
    }

    pub fn skills_run(&self, slug: &str) -> Result<SkillRunResult> {
        let conn = self.conn()?;
        let skill_row = conn
            .query_row(
                "SELECT id, config_yaml, enabled FROM skills WHERE slug = ?1",
                params![slug],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .optional()?;

        let (skill_id, yaml, enabled) =
            skill_row.ok_or_else(|| anyhow!("skill `{slug}` not found"))?;
        if enabled != 1 {
            bail!("skill `{slug}` is disabled");
        }

        let config: SkillConfig = serde_yaml::from_str(&yaml)?;
        let mut queued_jobs = 0_i64;

        for job in config.jobs {
            let normalized = normalize_job_type(&job.job_type);
            self.enqueue_job(&conn, Some(&skill_id), &normalized, None, 2)?;
            queued_jobs += 1;
        }

        drop(conn);
        let report = self.run_pending_jobs((queued_jobs.max(1) as u32).saturating_mul(3))?;

        Ok(SkillRunResult {
            skill_id,
            queued_jobs,
            report,
        })
    }

    pub(crate) fn insert_event(
        &self,
        conn: &Connection,
        event_type: &str,
        entity_type: &str,
        entity_id: Option<&str>,
        payload: &Value,
    ) -> Result<()> {
        conn.execute(
      "INSERT INTO events (id, type, entity_type, entity_id, payload_json, created_at, dedup_key)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL)",
      params![
        Uuid::new_v4().to_string(),
        event_type,
        entity_type,
        entity_id,
        serde_json::to_string(payload)?,
        now_rfc3339(),
      ],
    )?;

        Ok(())
    }

    pub(crate) fn resolve_project_id(
        &self,
        conn: &Connection,
        hint: Option<&str>,
    ) -> Result<String> {
        let Some(hint) = hint.map(str::trim).filter(|hint| !hint.is_empty()) else {
            return Ok(DEFAULT_PROJECT_ID.to_string());
        };

        let by_slug = conn
            .query_row(
                "SELECT id FROM projects WHERE slug = ?1",
                params![hint],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        if let Some(project_id) = by_slug {
            return Ok(project_id);
        }

        let by_id = conn
            .query_row(
                "SELECT id FROM projects WHERE id = ?1",
                params![hint],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        Ok(by_id.unwrap_or_else(|| DEFAULT_PROJECT_ID.to_string()))
    }

    pub(crate) fn append_section(
        &self,
        note_path: &str,
        section_title: &str,
        section_body: &str,
    ) -> Result<()> {
        let abs_path = self.resolve_markdown_path(note_path)?;
        let mut content = if abs_path.exists() {
            fs::read_to_string(&abs_path)?
        } else {
            format!("# {}\n", note_path.trim_end_matches(".md"))
        };

        if !content.ends_with('\n') {
            content.push('\n');
        }

        content.push('\n');
        content.push_str(section_title);
        content.push('\n');
        content.push_str(section_body);
        content.push('\n');

        let _ = self.vault_save_note(note_path, &content)?;
        Ok(())
    }
}

fn is_trash_rel_path(rel_path: &str) -> bool {
    rel_path == TRASH_ROOT_DIR || rel_path.starts_with(&format!("{TRASH_ROOT_DIR}/"))
}

fn file_mtime_ms(metadata: &fs::Metadata) -> Result<i64> {
    let modified = metadata.modified().context("cannot read file mtime")?;
    let duration = modified
        .duration_since(UNIX_EPOCH)
        .context("file mtime is before unix epoch")?;
    Ok(duration.as_millis() as i64)
}

fn build_restored_rel_path(original_path: &str) -> String {
    let path = Path::new(original_path);
    let parent = path
        .parent()
        .map(|value| value.to_string_lossy().replace('\\', "/"))
        .unwrap_or_default();
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("note");
    let suffix_full = Uuid::new_v4().simple().to_string();
    let suffix = &suffix_full[..8];
    let file_name = format!("{stem}-restored-{suffix}.md");

    if parent.is_empty() {
        file_name
    } else {
        format!("{parent}/{file_name}")
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, thread, time::Duration};

    use anyhow::Result;
    use tempfile::tempdir;

    use super::AppState;

    #[test]
    fn vault_delete_moves_note_to_trash_and_hides_from_list() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let path = "Notes/delete-me.md";
        let _ = state.vault_save_note(path, "# Delete me\n\nbody")?;

        let before = state.vault_list_notes()?;
        assert!(before.iter().any(|note| note.path == path));

        state.vault_delete_note(path)?;

        let after = state.vault_list_notes()?;
        assert!(!after.iter().any(|note| note.path == path));

        let trash = state.vault_trash_list()?;
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].original_path, path);

        Ok(())
    }

    #[test]
    fn vault_restore_returns_note_to_original_path() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let path = "Notes/restore-me.md";
        let body = "# Restore me\n\ntext";
        let _ = state.vault_save_note(path, body)?;
        state.vault_delete_note(path)?;

        let trash = state.vault_trash_list()?;
        assert_eq!(trash.len(), 1);

        let restored = state.vault_restore_note(&trash[0].id)?;
        assert_eq!(restored.path, path);

        let reopened = state.vault_get_note(path)?;
        assert_eq!(reopened.body_md, body);

        let trash_after = state.vault_trash_list()?;
        assert!(trash_after.is_empty());

        Ok(())
    }

    #[test]
    fn inbox_trash_hides_item_and_restore_returns_it() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let item = state.inbox_add_item(
            "quick_note".to_string(),
            "delete this inbox item".to_string(),
            vec![],
            None,
        )?;

        state.inbox_trash_item(&item.id)?;

        let visible = state.inbox_list(None)?;
        assert!(!visible.iter().any(|candidate| candidate.id == item.id));

        let trash = state.inbox_trash_list()?;
        assert_eq!(trash.len(), 1);
        assert_eq!(trash[0].id, item.id);

        let restored = state.inbox_restore_item(&item.id)?;
        assert_eq!(restored.id, item.id);
        assert_eq!(restored.status, "new");

        let visible_after_restore = state.inbox_list(None)?;
        assert!(visible_after_restore
            .iter()
            .any(|candidate| candidate.id == item.id));

        Ok(())
    }

    #[test]
    fn reindex_skips_unchanged_files() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let path = "Notes/stable.md";
        let _ = state.vault_save_note(path, "# Stable\n\nv1")?;

        let _ = state.vault_list_notes()?;
        let conn = state.conn()?;
        let updated_before: String = conn.query_row(
            "SELECT updated_at FROM notes WHERE path = ?1",
            rusqlite::params![path],
            |row| row.get(0),
        )?;
        drop(conn);

        thread::sleep(Duration::from_millis(25));
        let _ = state.vault_list_notes()?;

        let conn = state.conn()?;
        let updated_after: String = conn.query_row(
            "SELECT updated_at FROM notes WHERE path = ?1",
            rusqlite::params![path],
            |row| row.get(0),
        )?;

        assert_eq!(updated_before, updated_after);
        Ok(())
    }

    #[test]
    fn reindex_removes_deleted_files_from_index() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let path = "Notes/remove-from-index.md";
        let _ = state.vault_save_note(path, "# Remove\n\nbody")?;
        let _ = state.vault_list_notes()?;

        let abs_path = state.resolve_markdown_path(path)?;
        fs::remove_file(abs_path)?;

        let list_after_delete = state.vault_list_notes()?;
        assert!(!list_after_delete.iter().any(|note| note.path == path));

        Ok(())
    }

    #[test]
    fn vault_hard_delete_removes_trashed_file_and_entry() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let path = "Notes/hard-delete.md";
        let _ = state.vault_save_note(path, "# Hard delete\n\nbody")?;
        state.vault_delete_note(path)?;

        let conn = state.conn()?;
        let (trash_id, trashed_path): (String, String) = conn.query_row(
            "SELECT id, trashed_path FROM notes_trash LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        drop(conn);

        let trashed_abs_path = state.vault_root.join(&trashed_path);
        assert!(trashed_abs_path.exists());

        state.vault_delete_note_permanently(&trash_id)?;

        assert!(!trashed_abs_path.exists());
        let trash_after = state.vault_trash_list()?;
        assert!(trash_after.is_empty());

        Ok(())
    }

    #[test]
    fn vault_empty_trash_removes_all_entries() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let _ = state.vault_save_note("Notes/empty-a.md", "# A")?;
        let _ = state.vault_save_note("Notes/empty-b.md", "# B")?;
        state.vault_delete_note("Notes/empty-a.md")?;
        state.vault_delete_note("Notes/empty-b.md")?;

        let deleted = state.vault_empty_trash()?;
        assert_eq!(deleted, 2);
        assert!(state.vault_trash_list()?.is_empty());

        Ok(())
    }

    #[test]
    fn inbox_hard_delete_removes_item_completely() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let item = state.inbox_add_item(
            "quick_note".to_string(),
            "trash me forever".to_string(),
            vec![],
            None,
        )?;
        state.inbox_trash_item(&item.id)?;
        state.inbox_delete_item_permanently(&item.id)?;

        assert!(state.inbox_trash_list()?.is_empty());
        let conn = state.conn()?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(1) FROM inbox_items WHERE id = ?1",
            rusqlite::params![item.id],
            |row| row.get(0),
        )?;
        assert_eq!(count, 0);

        Ok(())
    }

    #[test]
    fn inbox_empty_trash_keeps_non_trashed_items() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let trashed = state.inbox_add_item(
            "quick_note".to_string(),
            "to delete".to_string(),
            vec![],
            None,
        )?;
        let keep = state.inbox_add_item(
            "quick_note".to_string(),
            "keep me".to_string(),
            vec![],
            None,
        )?;
        state.inbox_trash_item(&trashed.id)?;

        let deleted = state.inbox_empty_trash()?;
        assert_eq!(deleted, 1);
        assert!(state.inbox_trash_list()?.is_empty());

        let visible = state.inbox_list(None)?;
        assert!(visible.iter().any(|item| item.id == keep.id));
        assert!(!visible.iter().any(|item| item.id == trashed.id));

        Ok(())
    }

    #[test]
    fn reindex_debounce_delays_external_refresh_until_interval() -> Result<()> {
        let temp = tempdir()?;
        let state = AppState::for_test(temp.path())?;

        let path = "Notes/debounce.md";
        let _ = state.vault_save_note(path, "# Before\n\nbody")?;
        let _ = state.vault_list_notes()?;

        let abs_path = state.resolve_markdown_path(path)?;
        fs::write(&abs_path, "# After\n\nupdated externally")?;

        let too_early = state.vault_list_notes()?;
        let early_title = too_early
            .iter()
            .find(|note| note.path == path)
            .map(|note| note.title.clone())
            .unwrap_or_default();
        assert_eq!(early_title, "Before");

        thread::sleep(Duration::from_millis(900));
        let after_wait = state.vault_list_notes()?;
        let refreshed_title = after_wait
            .iter()
            .find(|note| note.path == path)
            .map(|note| note.title.clone())
            .unwrap_or_default();
        assert_eq!(refreshed_title, "After");

        Ok(())
    }
}
