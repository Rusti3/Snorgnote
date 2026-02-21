# Snorgnote

Open-source Tauri + Rust knowledge operating system for capture, processing, planning, focus, metrics, and progression.

## Workspace Layout

- `crates/core_domain`: domain entities, events, IDs, and shared enums.
- `crates/core_storage`: event store + projections + SQL schema helpers.
- `crates/core_vault`: markdown/frontmatter parsing, wikilinks, vault indexing, atomic writes.
- `crates/core_jobs`: queue, dedupe, retry/backoff, dead-letter orchestration.
- `crates/core_skills`: config-first skill manifests (`.yaml`) parser, validation, registry.
- `crates/core_llm`: provider abstraction with hybrid cloud/local fallback.
- `crates/core_planning`: daily/weekly planning heuristics and spaced-review logic.
- `crates/core_focus`: pomodoro sessions and focus analytics.
- `crates/core_metrics`: daily metrics projections and project health scoring.
- `crates/adapters`: capture adapter interfaces and v0.1 adapter stubs.
- `crates/app_commands`: command-layer facade that ties all core modules together.
- `migrations/0001_init.sql`: initial SQLite schema for events, inbox, jobs, notes, tasks, focus, and metrics.

## Development

```powershell
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

## Version Summaries

### v0.1.0-alpha.1
- Bootstrapped Rust workspace and crate boundaries.
- Added core domain model (`core_domain`) and event/projection storage skeleton (`core_storage`).
- Added initial migration file scaffold and repository structure.

### v0.1.0-alpha.2
- Implemented vault module: markdown/frontmatter parsing, `[[wikilinks]]`, recursive indexing, atomic note writes.
- Implemented job runtime: enqueue, dedupe keys, retries with exponential backoff, dead-letter queue, worker execution contract.
- Implemented skill system: YAML manifest parser, validation, registry loader, permissions/error/LLM policy fields.
- Implemented LLM abstraction with mock cloud/local providers and hybrid fallback behavior.
- Implemented planning module: daily suggestions, weekly summary generation, spaced-review note selection and interval updates.
- Implemented focus module: pomodoro start/stop lifecycle and per-project focus stats.
- Implemented metrics module: event-driven daily KPIs and derived project health scoring.
- Implemented adapters module: capture trait, manual adapter, and integration stubs for Telegram/Email/Browser.
- Implemented app command layer: vault, inbox, jobs, skills, review flow, pomodoro, dashboard APIs.
- Added unit tests across all crates; workspace passes `cargo clippy -D warnings` and `cargo test --workspace`.

### v0.1.0-alpha.3
- Installed desktop JavaScript dependencies and added Tauri CLI integration for local dev startup.
- Fixed Tauri workspace isolation by adding `[workspace]` to `apps/desktop/src-tauri/Cargo.toml`.
- Added required Windows icon asset (`apps/desktop/src-tauri/icons/icon.ico`) to satisfy `tauri-build`.
- Updated `tauri.conf.json` bundle mode for dev startup compatibility.
- Verified desktop run path: `npm run tauri:dev` now builds and starts `snorgnote-desktop.exe`.
