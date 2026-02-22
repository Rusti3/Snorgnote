use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::Duration as StdDuration,
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
        SkillRunResult,
    },
    utils::{
        extract_title, extract_wiki_links, normalize_job_type, now_rfc3339, parse_frontmatter,
        parse_tags_json, tags_from_frontmatter,
    },
};

#[derive(Debug, Clone)]
pub struct AppState {
    pub vault_root: PathBuf,
    pub db_path: PathBuf,
}

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
        self.reindex_vault(&conn)?;
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

            let body = fs::read_to_string(entry.path()).unwrap_or_default();
            let _ = self.upsert_note_from_body(conn, &rel_path, &body, None)?;
        }

        Ok(())
    }

    pub fn vault_list_notes(&self) -> Result<Vec<NoteSummary>> {
        let conn = self.conn()?;
        self.reindex_vault(&conn)?;

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
