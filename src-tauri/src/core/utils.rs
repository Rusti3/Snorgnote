use std::{collections::BTreeSet, path::Path};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use regex::Regex;
use serde_json::{json, Value};

pub fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}

pub fn parse_frontmatter(body_md: &str) -> (Value, String) {
    let normalized = body_md.replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return (json!({}), body_md.to_string());
    }

    let rest = &normalized[4..];
    let Some(separator_index) = rest.find("\n---\n") else {
        return (json!({}), body_md.to_string());
    };

    let yaml_str = &rest[..separator_index];
    let body = &rest[(separator_index + 5)..];

    let frontmatter = serde_yaml::from_str::<serde_yaml::Value>(yaml_str)
        .ok()
        .and_then(|value| serde_json::to_value(value).ok())
        .unwrap_or_else(|| json!({}));

    (frontmatter, body.to_string())
}

pub fn tags_from_frontmatter(frontmatter: &Value) -> Vec<String> {
    let Some(tags_value) = frontmatter.get("tags") else {
        return Vec::new();
    };

    if let Some(arr) = tags_value.as_array() {
        return arr
            .iter()
            .filter_map(|item| item.as_str().map(|value| value.trim().to_string()))
            .filter(|value| !value.is_empty())
            .collect();
    }

    if let Some(single) = tags_value.as_str() {
        return single
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToString::to_string)
            .collect();
    }

    Vec::new()
}

pub fn extract_title(markdown: &str, fallback_path: &str) -> String {
    for line in markdown.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            let title = rest.trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }

    Path::new(fallback_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("Untitled")
        .to_string()
}

pub fn extract_wiki_links(markdown: &str) -> Vec<String> {
    let regex = Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").expect("valid wiki-link regex");
    let mut links = BTreeSet::new();

    for captures in regex.captures_iter(markdown) {
        let Some(matched) = captures.get(1) else {
            continue;
        };
        let target = matched.as_str().trim().replace('\\', "/");
        if !target.is_empty() {
            links.insert(target);
        }
    }

    links.into_iter().collect()
}

pub fn summarize_text(content: &str) -> String {
    let compact = content.replace("\r\n", "\n");
    let mut summary_parts = Vec::new();

    for segment in compact.split_terminator(['.', '!', '?', '\n']) {
        let normalized = segment.trim();
        if normalized.is_empty() {
            continue;
        }
        summary_parts.push(normalized.to_string());
        if summary_parts.len() >= 3 {
            break;
        }
    }

    if summary_parts.is_empty() {
        return compact.chars().take(240).collect();
    }

    let summary = summary_parts.join(". ");
    if summary.len() > 360 {
        format!("{}...", summary.chars().take(357).collect::<String>())
    } else {
        format!("{summary}.")
    }
}

pub fn extract_task_candidates(content: &str) -> Vec<String> {
    let checkbox_re = Regex::new(r"(?m)^\s*[-*]\s*(?:\[\s\]\s*)?(.{3,180})$")
        .expect("valid task extraction regex");
    let mut tasks = BTreeSet::new();

    for captures in checkbox_re.captures_iter(content) {
        let Some(raw) = captures.get(1) else {
            continue;
        };
        let candidate = raw
            .as_str()
            .trim()
            .trim_end_matches('.')
            .trim_end_matches(';')
            .trim()
            .to_string();
        if candidate.len() >= 3 {
            tasks.insert(candidate);
        }
    }

    if tasks.is_empty() {
        let sentence_re = Regex::new(r"(?m)([^.!?\n]{8,180})").expect("valid sentence regex");
        for captures in sentence_re.captures_iter(content) {
            let Some(raw) = captures.get(1) else {
                continue;
            };
            let candidate = raw.as_str().trim();
            if candidate.len() < 8 {
                continue;
            }
            tasks.insert(candidate.to_string());
            if tasks.len() >= 3 {
                break;
            }
        }
    }

    tasks.into_iter().collect()
}

pub fn normalize_job_type(job_type: &str) -> String {
    match job_type.trim() {
        "summarize_llm" => "summarize".to_string(),
        "extract_actions" => "extract_tasks".to_string(),
        other => other.to_string(),
    }
}

pub fn parse_tags_json(raw: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(raw).unwrap_or_default()
}

pub fn duration_between_secs(started_at: &str, ended_at: &str) -> Result<i64> {
    let start = DateTime::parse_from_rfc3339(started_at)
        .with_context(|| format!("invalid start timestamp: {started_at}"))?;
    let end = DateTime::parse_from_rfc3339(ended_at)
        .with_context(|| format!("invalid end timestamp: {ended_at}"))?;
    Ok((end - start).num_seconds().max(0))
}
