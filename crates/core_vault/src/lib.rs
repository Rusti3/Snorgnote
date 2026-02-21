use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::fs;
use std::io::{Error, ErrorKind, Write};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedNote {
    pub id: String,
    pub path: PathBuf,
    pub title: String,
    pub frontmatter: BTreeMap<String, String>,
    pub body: String,
    pub links: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSummary {
    pub id: String,
    pub path: PathBuf,
    pub title: String,
    pub links: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FrontmatterParse {
    pub frontmatter: BTreeMap<String, String>,
    pub body: String,
}

pub fn parse_frontmatter(content: &str) -> FrontmatterParse {
    let normalized = content.replace("\r\n", "\n");
    let mut lines = normalized.lines();
    let Some(first) = lines.next() else {
        return FrontmatterParse {
            frontmatter: BTreeMap::new(),
            body: String::new(),
        };
    };

    if first.trim() != "---" {
        return FrontmatterParse {
            frontmatter: BTreeMap::new(),
            body: normalized,
        };
    }

    let mut frontmatter = BTreeMap::new();
    let mut is_frontmatter = true;
    let mut body_lines = Vec::new();

    for line in lines {
        if is_frontmatter {
            if line.trim() == "---" {
                is_frontmatter = false;
                continue;
            }
            if let Some((key, value)) = line.split_once(':') {
                frontmatter.insert(
                    key.trim().to_string(),
                    value.trim().trim_matches('"').to_string(),
                );
            }
        } else {
            body_lines.push(line);
        }
    }

    if is_frontmatter {
        return FrontmatterParse {
            frontmatter: BTreeMap::new(),
            body: normalized,
        };
    }

    FrontmatterParse {
        frontmatter,
        body: body_lines.join("\n"),
    }
}

pub fn extract_wikilinks(text: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut chars = text.char_indices().peekable();

    while let Some((idx, ch)) = chars.next() {
        if ch != '[' {
            continue;
        }
        let Some((next_idx, next_ch)) = chars.peek() else {
            continue;
        };
        if *next_ch != '[' || *next_idx != idx + 1 {
            continue;
        }
        chars.next();
        let mut end = None;
        let start = idx + 2;
        while let Some((i, c)) = chars.next() {
            if c == ']'
                && let Some((j, c2)) = chars.peek()
                && *c2 == ']'
                && *j == i + 1
            {
                end = Some(i);
                chars.next();
                break;
            }
        }
        if let Some(end_idx) = end {
            let inner = text[start..end_idx].trim();
            if inner.is_empty() {
                continue;
            }
            let target = inner
                .split('|')
                .next()
                .map(str::trim)
                .unwrap_or_default()
                .to_string();
            if !target.is_empty() {
                result.push(target);
            }
        }
    }

    result
}

pub fn parse_note(path: impl AsRef<Path>, content: &str) -> ParsedNote {
    let path = path.as_ref().to_path_buf();
    let parsed = parse_frontmatter(content);
    let title = extract_title(&path, &parsed.body);
    let links = extract_wikilinks(&parsed.body);
    let id = parsed
        .frontmatter
        .get("id")
        .cloned()
        .unwrap_or_else(|| normalize_note_id(&title));

    ParsedNote {
        id,
        path,
        title,
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        links,
    }
}

pub fn normalize_note_id(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut prev_dash = false;
    for c in input.trim().chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "untitled".to_string()
    } else {
        out
    }
}

pub fn scan_markdown_files(root: impl AsRef<Path>) -> Result<Vec<PathBuf>, Error> {
    let mut result = Vec::new();
    let root = root.as_ref();
    if !root.exists() {
        return Err(Error::new(ErrorKind::NotFound, "vault path does not exist"));
    }
    scan_recursive(root, &mut result)?;
    result.sort();
    Ok(result)
}

fn scan_recursive(path: &Path, output: &mut Vec<PathBuf>) -> Result<(), Error> {
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let entry_path = entry.path();
        if entry_path.is_dir() {
            scan_recursive(&entry_path, output)?;
            continue;
        }
        if entry_path.extension() == Some(OsStr::new("md")) {
            output.push(entry_path);
        }
    }
    Ok(())
}

pub fn index_vault(root: impl AsRef<Path>) -> Result<Vec<ParsedNote>, Error> {
    let files = scan_markdown_files(root)?;
    let mut notes = Vec::with_capacity(files.len());
    for file in files {
        let content = fs::read_to_string(&file)?;
        notes.push(parse_note(file, &content));
    }
    Ok(notes)
}

pub fn to_summary(note: &ParsedNote) -> NoteSummary {
    NoteSummary {
        id: note.id.clone(),
        path: note.path.clone(),
        title: note.title.clone(),
        links: note.links.len(),
    }
}

pub fn write_note_atomic(path: impl AsRef<Path>, content: &str) -> Result<(), Error> {
    let path = path.as_ref();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let temp = path.with_extension("tmp");
    {
        let mut file = fs::File::create(&temp)?;
        file.write_all(content.as_bytes())?;
        file.flush()?;
    }
    fs::rename(temp, path)?;
    Ok(())
}

fn extract_title(path: &Path, body: &str) -> String {
    for line in body.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            return rest.trim().to_string();
        }
    }
    path.file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("untitled")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontmatter_is_parsed() {
        let content = r#"---
id: note-1
project: alpha
---
# Test
Body
"#;
        let parsed = parse_frontmatter(content);
        assert_eq!(
            parsed.frontmatter.get("id").map(String::as_str),
            Some("note-1")
        );
        assert!(parsed.body.contains("# Test"));
    }

    #[test]
    fn malformed_frontmatter_falls_back_to_plain_body() {
        let content = "---\nid: 1\n# Heading";
        let parsed = parse_frontmatter(content);
        assert!(parsed.frontmatter.is_empty());
        assert_eq!(parsed.body, "---\nid: 1\n# Heading");
    }

    #[test]
    fn wikilinks_are_extracted() {
        let links = extract_wikilinks("See [[Daily Note]] and [[Project|alias]].");
        assert_eq!(links, vec!["Daily Note".to_string(), "Project".to_string()]);
    }

    #[test]
    fn note_id_is_slugified() {
        assert_eq!(normalize_note_id("Hello, World!"), "hello-world");
        assert_eq!(normalize_note_id("   "), "untitled");
    }

    #[test]
    fn parse_note_uses_frontmatter_id() {
        let note = parse_note(
            "vault/test.md",
            "---\nid: abc\n---\n# Heading\nLink to [[X]].",
        );
        assert_eq!(note.id, "abc");
        assert_eq!(note.title, "Heading");
        assert_eq!(note.links, vec!["X".to_string()]);
    }

    #[test]
    fn index_and_write_roundtrip() {
        let root = std::env::temp_dir().join("snorgnote-vault-test");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("temp dir should be created");
        let note_path = root.join("daily.md");
        write_note_atomic(
            &note_path,
            "---\nid: daily-1\n---\n# Daily\nText with [[Ref]].",
        )
        .expect("note should be written");

        let notes = index_vault(&root).expect("vault should be indexed");
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].id, "daily-1");
        assert_eq!(notes[0].links, vec!["Ref".to_string()]);

        let _ = fs::remove_dir_all(&root);
    }
}
