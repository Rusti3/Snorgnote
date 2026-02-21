# Snorgnote Roadmap (v0.1.0-alpha.4 Planning Baseline)

## 1. Vision and Product Goal

Build Snorgnote into a reliable personal operating system for knowledge and execution:
- Capture everything into one inbox.
- Process automatically via skills and LLM jobs.
- Organize into vault-native notes/tasks/links.
- Act daily with planning/focus/review loops.
- Measure progress and health.
- Project progress into a fair game layer derived from real work.

Primary objective for v1.0.0:
- `Reliable Personal OS` first.
- Integrations and reliability before deep game complexity.

Planning horizon:
- 6 to 9 months from current state (`v0.1.0-alpha.3`).

## 2. Current Baseline

Already implemented:
- Rust modular core crates (`core_*`, `adapters`, `app_commands`).
- Event/domain models, vault parsing/indexing, job queue with retries/dead-letter.
- Config-first skill manifest parser/validator/registry.
- Planning/focus/metrics primitives and tests.
- Tauri + React desktop scaffold with working dev launch.

Still missing for production usage:
- Real Telegram/Email/Browser integrations.
- Durable runtime (full persistence/recovery guarantees).
- Full UI workflows (Inbox, Daily, Review, Projects, Dashboard).
- Production retrieval/RAG quality and source-grounded QA UX.
- Release hardening and contributor-grade docs.

## 3. Release Sequence

## Phase A - Core Hardening (`v0.2.0`, Weeks 1-4)
Goals:
- Make core runtime crash-safe and restart-safe.

Scope:
- Persist inbox/jobs/events/metrics to SQLite (not only in-memory runtime state).
- Migration runner and schema version tracking.
- Startup recovery for pending/running jobs.
- Vault watcher robustness (debounce, idempotent indexing, conflict-safe writes).
- Structured local logs and diagnostics.

Exit criteria:
- Restart does not lose queued jobs.
- Core flows survive abnormal shutdown.

## Phase B - Real Capture Integrations (`v0.3.0`, Weeks 5-10)
Goals:
- Deliver real inbound channels into unified inbox.

Scope:
- Telegram bot capture adapter.
- Browser clipper MVP (page URL + selection/body snapshot).
- Email ingest MVP (IMAP polling + metadata extraction).
- Canonical inbox normalization contract for all adapters.

Exit criteria:
- End-to-end from each adapter to inbox item + job enqueue works.

## Phase C - Skills Runtime and Automation (`v0.4.0`, Weeks 11-16)
Goals:
- Move from skill parsing to production skill orchestration.

Scope:
- Trigger execution engine: `manual`, `schedule(cron)`, `event(type)`.
- Per-skill execution history and failure traces.
- Stable retry/fallback/dead-letter policies at runtime.
- Vault output writers for daily/weekly/project sections with citations.
- Built-in jobs hardening: summarize, extract_tasks, auto_tag, plan_daily, spaced_review_pick.

Exit criteria:
- Skills run unattended on schedules/events with observable state.

## Phase D - Daily UX Loop (`v0.5.0`, Weeks 17-22)
Goals:
- Make daily product value obvious in desktop UI.

Scope:
- Complete panels for Inbox, Daily/Weekly, Focus, Review queue.
- Pomodoro task/project binding + session history UI.
- Review grading flow with interval updates.
- Weekly synthesis with concrete next actions.

Exit criteria:
- A user can operate full day loop without CLI/debug tools.

## Phase E - Search, Graph, RAG (`v0.6.0`, Weeks 23-28)
Goals:
- Make knowledge retrieval trustworthy and fast.

Scope:
- FTS + graph signal ranking for retrieval.
- Source-grounded QA with mandatory citations.
- Optional embeddings backend behind feature flag.
- Graph explorer MVP.

Exit criteria:
- Answers over vault always reference source notes/paths.

## Phase F - Dashboard and Basic Game Layer (`v0.7.0`, Weeks 29-34)
Goals:
- Add progression feedback derived from real behavior.

Scope:
- KPI dashboard: inbox throughput, focus time, review cadence, project health.
- Basic progression model (levels/resources from real metrics).
- Logistics board MVP (bottlenecks, overloaded flows, route hints).

Exit criteria:
- No artificial farming path; game values are projection-only.

## Phase G - Stabilization and OSS Release (`v1.0.0`, Weeks 35-40)
Goals:
- Freeze stable contracts and ship contributor-ready release.

Scope:
- Freeze `skill.yaml v1`, command API contracts, event payload versioning.
- Compatibility policy for migrations and data evolution.
- Windows-first release pipeline and packaging docs.
- Security/privacy pass (secrets, telemetry opt-in model, auditability).
- Contributor guides for skills/adapters/core architecture.

Exit criteria:
- Stable `v1.0.0` with documented extension pathways.

## 4. Interface Contracts to Finalize

## 4.1 Tauri/App Command Layer
Stabilize command set (target surface):
- `vault_open`, `vault_scan`
- `capture_manual`, `inbox_list`
- `job_enqueue`, `job_retry`, `run_jobs`
- `skills_load_dir`, `skills_list`, `skill_enable`
- `daily_generate`, `weekly_generate`
- `review_get_due`, `review_mark`
- `pomodoro_start`, `pomodoro_stop`
- `dashboard_get`
- `search_notes`

Require:
- Typed error categories.
- Consistent serialization for UI.

## 4.2 Skill Manifest v1
Freeze schema fields:
- `id`, `name`, `version`, `description`, `enabled`
- `triggers`, `inputs`, `jobs`, `outputs`
- `llm_policy`, `error_policy`, `permissions`

Require:
- Semantic validation rules.
- Backward-compatible versioning strategy.

## 4.3 Events and Storage
Require:
- Stable event type catalog + payload version field.
- Mandatory correlation/causation IDs in runtime.
- Forward-only migration policy.

## 5. Quality Gates

## 5.1 Mandatory Commands (for release candidates)
- `cargo fmt --all`
- `cargo clippy --workspace --all-targets -- -D warnings`
- `cargo test --workspace`

## 5.2 Test Matrix
Unit:
- Parsing invariants (vault/frontmatter/wikilinks/skill manifests).
- Job state transitions and retry math.
- Planner/review scoring and interval updates.

Integration:
- Adapter capture -> inbox -> job enqueue -> skill run -> vault write -> reindex.
- Recovery after restart with queued/running jobs.
- Citation integrity for generated outputs.

E2E:
- Daily path: capture -> plan -> pomodoro -> review -> weekly summary.

Performance baseline:
- Search latency <=150ms on 10k notes (reference machine class).
- Sustained processing >=1k inbox items/day without loss.

## 6. Risks and Mitigations

Risk:
- Adapter API instability and auth issues.
Mitigation:
- Strict adapter isolation, retries, circuit breakers, clear health states.

Risk:
- Vault and DB divergence.
Mitigation:
- Deterministic reconciliation jobs + periodic consistency checks.

Risk:
- LLM output drift/hallucination.
Mitigation:
- Structured output contracts + citation-required policy + provider fallback.

Risk:
- Game layer distorting behavior.
Mitigation:
- Derived-only scoring from real work signals, no standalone farm mechanics.

## 7. Definition of Done for v1.0.0

Must be true:
- Daily usage is reliable on Windows without manual repair.
- At least 2 production-grade capture integrations + manual capture.
- Skills execute on schedule/event with observable results and retries.
- Planner/focus/review loop usable end-to-end in desktop UI.
- Knowledge QA includes citations to vault sources.
- Dashboard and basic progression layer are live and fair.
- Public docs and extension guides are complete.

## 8. Operating Assumptions
- Platform strategy: Windows-first quality, Linux/macOS follow.
- Sync strategy: bring-your-own sync (Git/Obsidian Sync/etc.).
- Secrets strategy: OS keychain, not vault/plaintext storage.
- Telemetry strategy: local-first, external export only opt-in.
