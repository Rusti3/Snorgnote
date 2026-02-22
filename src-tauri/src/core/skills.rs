use crate::core::types::{SkillConfig, SkillValidation};

pub fn validate_skill_yaml(yaml: &str) -> SkillValidation {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    let parsed = match serde_yaml::from_str::<SkillConfig>(yaml) {
        Ok(config) => config,
        Err(error) => {
            return SkillValidation {
                valid: false,
                parsed_id: None,
                errors: vec![format!("YAML parsing failed: {error}")],
                warnings,
            }
        }
    };

    if parsed.id.trim().is_empty() {
        errors.push("`id` must not be empty".to_string());
    }
    if parsed.version == 0 {
        errors.push("`version` must be >= 1".to_string());
    }
    if parsed.jobs.is_empty() {
        errors.push("at least one job must be defined".to_string());
    }

    let known_job_types = [
        "summarize",
        "summarize_llm",
        "tag",
        "extract_tasks",
        "extract_actions",
        "plan_daily",
        "plan_weekly",
        "spaced_review_select",
        "project_health_update",
        "stats_rollup",
        "aggregate",
    ];

    for job in &parsed.jobs {
        if !known_job_types.contains(&job.job_type.as_str()) {
            warnings.push(format!(
                "job type `{}` is not known yet and may fail at runtime",
                job.job_type
            ));
        }
    }

    if parsed.outputs.is_empty() {
        warnings.push("`outputs` is empty; skill will only affect internal state".to_string());
    }

    SkillValidation {
        valid: errors.is_empty(),
        parsed_id: Some(parsed.id),
        errors,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::validate_skill_yaml;

    #[test]
    fn validation_flags_missing_jobs() {
        let yaml = "id: empty_skill\nversion: 1\nenabled: true";
        let validation = validate_skill_yaml(yaml);
        assert!(!validation.valid);
        assert!(validation
            .errors
            .iter()
            .any(|error| error.contains("at least one job")));
    }
}
