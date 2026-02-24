pub mod db;
pub mod deeplink;
pub mod flashcards;
pub mod focus;
pub mod jobs;
pub mod planner;
pub mod protocol;
pub mod review;
pub mod skills;
pub mod state;
pub mod telegram;
pub mod types;
pub mod utils;

pub use skills::validate_skill_yaml;
pub use state::AppState;
pub use types::*;

#[cfg(test)]
mod tests {
    use super::utils::parse_frontmatter;

    #[test]
    fn frontmatter_parsing_extracts_yaml_and_body() {
        let source = "---\ntags:\n  - rust\n  - tauri\nproject: alpha\n---\n# Title\nBody";
        let (frontmatter, body) = parse_frontmatter(source);

        assert_eq!(frontmatter["project"], "alpha");
        assert!(body.starts_with("# Title"));
    }
}
