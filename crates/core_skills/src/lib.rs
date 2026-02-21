use std::collections::BTreeMap;
use std::fs;
use std::io::{Error, ErrorKind};
use std::path::{Path, PathBuf};

use core_domain::JobKind;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Trigger {
    Manual,
    Schedule(String),
    Event(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SkillInputs {
    pub folders: Vec<String>,
    pub tags: Vec<String>,
    pub sources: Vec<String>,
    pub time_window_days: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillOutput {
    pub target: String,
    pub section: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmPolicy {
    pub provider: Option<String>,
    pub model: Option<String>,
    pub citation_required: bool,
}

impl Default for LlmPolicy {
    fn default() -> Self {
        Self {
            provider: None,
            model: None,
            citation_required: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ErrorPolicy {
    pub max_retries: u32,
    pub fallback: Option<String>,
    pub dead_letter: bool,
}

impl Default for ErrorPolicy {
    fn default() -> Self {
        Self {
            max_retries: 3,
            fallback: None,
            dead_letter: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SkillPermissions {
    pub read: Vec<String>,
    pub write: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub enabled: bool,
    pub triggers: Vec<Trigger>,
    pub inputs: SkillInputs,
    pub jobs: Vec<JobKind>,
    pub outputs: Vec<SkillOutput>,
    pub llm_policy: LlmPolicy,
    pub error_policy: ErrorPolicy,
    pub permissions: SkillPermissions,
    pub manifest_path: Option<PathBuf>,
}

impl SkillManifest {
    pub fn validate(&self) -> Result<(), String> {
        if self.id.trim().is_empty() {
            return Err("skill id is required".to_string());
        }
        if self.name.trim().is_empty() {
            return Err(format!("skill `{}` must have a name", self.id));
        }
        if self.version.trim().is_empty() {
            return Err(format!("skill `{}` must have a version", self.id));
        }
        if self.jobs.is_empty() {
            return Err(format!("skill `{}` must define at least one job", self.id));
        }
        if self.outputs.is_empty() {
            return Err(format!(
                "skill `{}` must define at least one output",
                self.id
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Default)]
pub struct SkillRegistry {
    skills: BTreeMap<String, SkillManifest>,
}

impl SkillRegistry {
    pub fn empty() -> Self {
        Self {
            skills: BTreeMap::new(),
        }
    }

    pub fn upsert(&mut self, skill: SkillManifest) -> Result<(), String> {
        skill.validate()?;
        self.skills.insert(skill.id.clone(), skill);
        Ok(())
    }

    pub fn list(&self) -> Vec<&SkillManifest> {
        self.skills.values().collect()
    }

    pub fn get(&self, id: &str) -> Option<&SkillManifest> {
        self.skills.get(id)
    }

    pub fn get_mut(&mut self, id: &str) -> Option<&mut SkillManifest> {
        self.skills.get_mut(id)
    }

    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> bool {
        if let Some(skill) = self.skills.get_mut(id) {
            skill.enabled = enabled;
            return true;
        }
        false
    }

    pub fn load_from_dir(path: impl AsRef<Path>) -> Result<Self, Error> {
        let root = path.as_ref();
        let mut registry = SkillRegistry::empty();
        if !root.exists() {
            return Ok(registry);
        }

        for entry in fs::read_dir(root)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(ext) = path.extension().and_then(|ext| ext.to_str()) else {
                continue;
            };
            if !matches!(ext, "yaml" | "yml") {
                continue;
            }
            let content = fs::read_to_string(&path)?;
            let mut skill = parse_manifest(&content).map_err(|message| {
                Error::new(
                    ErrorKind::InvalidData,
                    format!("{} ({})", message, path.display()),
                )
            })?;
            skill.manifest_path = Some(path.clone());
            skill
                .validate()
                .map_err(|e| Error::new(ErrorKind::InvalidData, e))?;
            registry
                .upsert(skill)
                .map_err(|e| Error::new(ErrorKind::InvalidData, e))?;
        }

        Ok(registry)
    }
}

pub fn parse_manifest(content: &str) -> Result<SkillManifest, String> {
    let mut scalar = BTreeMap::<String, String>::new();
    let mut sections = BTreeMap::<String, Vec<String>>::new();
    let mut nested_lists = BTreeMap::<(String, String), Vec<String>>::new();
    let mut nested_scalars = BTreeMap::<(String, String), String>::new();
    let mut outputs = Vec::<SkillOutput>::new();

    let normalized = content.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.lines().collect();
    let mut index = 0;
    let mut current_section: Option<String> = None;
    let mut current_subkey: Option<String> = None;

    while index < lines.len() {
        let line = lines[index];
        index += 1;
        let raw = line.trim_end();
        if raw.trim().is_empty() || raw.trim_start().starts_with('#') {
            continue;
        }

        let indent = raw.chars().take_while(|c| *c == ' ').count();
        let line = raw.trim_start();

        if indent == 0 {
            current_section = None;
            current_subkey = None;
            if let Some((key, value)) = split_key_value(line) {
                if value.is_empty() {
                    current_section = Some(key.to_string());
                    sections.entry(key.to_string()).or_default();
                } else {
                    scalar.insert(key.to_string(), value.to_string());
                }
                continue;
            }
            return Err(format!("invalid top-level line `{line}`"));
        }

        let Some(section) = current_section.clone() else {
            return Err(format!("orphan indented line `{line}`"));
        };

        if indent == 2 && line.starts_with("- ") {
            let value = line.trim_start_matches("- ").trim();
            if section == "outputs" {
                if let Some((k, v)) = split_key_value(value) {
                    if k == "target" {
                        outputs.push(SkillOutput {
                            target: v.to_string(),
                            section: None,
                        });
                    } else {
                        outputs.push(SkillOutput {
                            target: value.to_string(),
                            section: None,
                        });
                    }
                } else {
                    outputs.push(SkillOutput {
                        target: value.to_string(),
                        section: None,
                    });
                }
            } else {
                sections.entry(section).or_default().push(value.to_string());
            }
            continue;
        }

        if indent == 2 {
            if let Some((key, value)) = split_key_value(line) {
                current_subkey = Some(key.to_string());
                if value.is_empty() {
                    nested_lists
                        .entry((section.clone(), key.to_string()))
                        .or_default();
                } else {
                    nested_scalars.insert((section.clone(), key.to_string()), value.to_string());
                }
                continue;
            }
            return Err(format!("invalid section line `{line}`"));
        }

        if indent == 4 && line.starts_with("- ") {
            let Some(subkey) = current_subkey.clone() else {
                return Err(format!("orphan nested list line `{line}`"));
            };
            let value = line.trim_start_matches("- ").trim().to_string();
            nested_lists
                .entry((section, subkey))
                .or_default()
                .push(value);
            continue;
        }

        if indent == 4
            && section == "outputs"
            && let Some((key, value)) = split_key_value(line)
            && let Some(last) = outputs.last_mut()
        {
            match key {
                "target" => last.target = value.to_string(),
                "section" => last.section = Some(value.to_string()),
                _ => {}
            }
            continue;
        }

        return Err(format!("unsupported syntax `{line}`"));
    }

    let id = scalar
        .get("id")
        .cloned()
        .ok_or_else(|| "missing required field `id`".to_string())?;
    let name = scalar
        .get("name")
        .cloned()
        .ok_or_else(|| "missing required field `name`".to_string())?;
    let version = scalar
        .get("version")
        .cloned()
        .ok_or_else(|| "missing required field `version`".to_string())?;

    let triggers = sections
        .remove("triggers")
        .unwrap_or_else(|| vec!["manual".to_string()])
        .into_iter()
        .map(parse_trigger)
        .collect::<Result<Vec<_>, _>>()?;

    let jobs = sections
        .remove("jobs")
        .unwrap_or_default()
        .into_iter()
        .map(|value| JobKind::from(value.as_str()))
        .collect::<Vec<_>>();

    let inputs = SkillInputs {
        folders: nested_lists
            .remove(&(String::from("inputs"), String::from("folders")))
            .unwrap_or_default(),
        tags: nested_lists
            .remove(&(String::from("inputs"), String::from("tags")))
            .unwrap_or_default(),
        sources: nested_lists
            .remove(&(String::from("inputs"), String::from("sources")))
            .unwrap_or_default(),
        time_window_days: nested_scalars
            .get(&(String::from("inputs"), String::from("time_window_days")))
            .and_then(|value| value.parse::<u32>().ok()),
    };

    let llm_policy = LlmPolicy {
        provider: nested_scalars
            .get(&(String::from("llm_policy"), String::from("provider")))
            .cloned(),
        model: nested_scalars
            .get(&(String::from("llm_policy"), String::from("model")))
            .cloned(),
        citation_required: nested_scalars
            .get(&(
                String::from("llm_policy"),
                String::from("citation_required"),
            ))
            .map(|v| parse_bool(v))
            .unwrap_or(true),
    };

    let error_policy = ErrorPolicy {
        max_retries: nested_scalars
            .get(&(String::from("error_policy"), String::from("max_retries")))
            .and_then(|value| value.parse().ok())
            .unwrap_or(3),
        fallback: nested_scalars
            .get(&(String::from("error_policy"), String::from("fallback")))
            .cloned(),
        dead_letter: nested_scalars
            .get(&(String::from("error_policy"), String::from("dead_letter")))
            .map(|v| parse_bool(v))
            .unwrap_or(true),
    };

    let permissions = SkillPermissions {
        read: nested_lists
            .remove(&(String::from("permissions"), String::from("read")))
            .unwrap_or_default(),
        write: nested_lists
            .remove(&(String::from("permissions"), String::from("write")))
            .unwrap_or_default(),
    };

    if outputs.is_empty()
        && let Some(raw_outputs) = sections.remove("outputs")
    {
        outputs.extend(raw_outputs.into_iter().map(|target| SkillOutput {
            target,
            section: None,
        }));
    }

    Ok(SkillManifest {
        id,
        name,
        version,
        description: scalar.get("description").cloned(),
        enabled: scalar
            .get("enabled")
            .map(|value| parse_bool(value))
            .unwrap_or(true),
        triggers,
        inputs,
        jobs,
        outputs,
        llm_policy,
        error_policy,
        permissions,
        manifest_path: None,
    })
}

fn parse_trigger(raw: String) -> Result<Trigger, String> {
    if raw.eq_ignore_ascii_case("manual") {
        return Ok(Trigger::Manual);
    }
    if let Some(inner) = raw
        .strip_prefix("schedule(")
        .and_then(|s| s.strip_suffix(')'))
    {
        return Ok(Trigger::Schedule(inner.to_string()));
    }
    if let Some(inner) = raw.strip_prefix("event(").and_then(|s| s.strip_suffix(')')) {
        return Ok(Trigger::Event(inner.to_string()));
    }
    Err(format!("unsupported trigger `{raw}`"))
}

fn parse_bool(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "true" | "1" | "yes" | "y" | "on"
    )
}

fn split_key_value(line: &str) -> Option<(&str, &str)> {
    let (key, value) = line.split_once(':')?;
    Some((key.trim(), value.trim().trim_matches('"')))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_manifest_with_nested_sections() {
        let yaml = r#"
id: spaced_review
name: Spaced Review
version: 1.0.0
description: Select notes for recall
enabled: true
triggers:
  - schedule(0 7 * * *)
inputs:
  tags:
    - knowledge
  folders:
    - notes/core
  sources:
    - manual
  time_window_days: 14
jobs:
  - spaced_review_pick
  - plan_daily
outputs:
  - target: daily
    section: Recall/Review
llm_policy:
  provider: cloud
  model: gpt-4o-mini
  citation_required: true
error_policy:
  max_retries: 4
  dead_letter: true
permissions:
  read:
    - notes/*
  write:
    - daily/*
"#;

        let manifest = parse_manifest(yaml).expect("manifest should parse");
        assert_eq!(manifest.id, "spaced_review");
        assert_eq!(manifest.jobs.len(), 2);
        assert_eq!(manifest.inputs.tags, vec!["knowledge".to_string()]);
        assert_eq!(manifest.outputs[0].target, "daily");
        assert_eq!(
            manifest.outputs[0].section.as_deref(),
            Some("Recall/Review")
        );
        manifest.validate().expect("manifest should be valid");
    }

    #[test]
    fn invalid_manifest_missing_id() {
        let yaml = "name: X\nversion: 1\njobs:\n  - summarize\noutputs:\n  - daily";
        let err = parse_manifest(yaml).expect_err("missing id should fail");
        assert!(err.contains("id"));
    }

    #[test]
    fn registry_enable_disable() {
        let mut registry = SkillRegistry::empty();
        let manifest = SkillManifest {
            id: "daily".to_string(),
            name: "Daily".to_string(),
            version: "1".to_string(),
            description: None,
            enabled: true,
            triggers: vec![Trigger::Manual],
            inputs: SkillInputs::default(),
            jobs: vec![JobKind::PlanDaily],
            outputs: vec![SkillOutput {
                target: "daily".to_string(),
                section: None,
            }],
            llm_policy: LlmPolicy::default(),
            error_policy: ErrorPolicy::default(),
            permissions: SkillPermissions::default(),
            manifest_path: None,
        };

        registry.upsert(manifest).expect("upsert should work");
        assert!(registry.set_enabled("daily", false));
        assert!(!registry.get("daily").expect("skill should exist").enabled);
    }
}
