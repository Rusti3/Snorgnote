# Snorgnote Architecture (v0.1-alpha)

## Pipeline

1. Capture: user or adapter creates inbox items.
2. Process: job queue runs skill-defined pipelines.
3. Organize: notes/tasks/events are written to vault and projections.
4. Act: daily/weekly plans + pomodoro sessions.
5. Measure: metrics aggregate event stream into dashboard projections.
6. Level-up: derived project health and progression metrics.

## Source of Truth

- Human-readable data: local markdown vault.
- Operational speed layer: SQLite tables and event projections.
- Contracts: domain events + skill manifest schema.

## Runtime Modules

- `core_domain`: entities and event vocabulary.
- `core_storage`: event store and read models.
- `core_vault`: markdown and link indexing.
- `core_jobs`: orchestration and retries.
- `core_skills`: skill loading and validation.
- `core_llm`: model providers and fallback.
- `core_planning`: daily/weekly/review heuristics.
- `core_focus`: pomodoro sessions.
- `core_metrics`: KPI projections.
- `app_commands`: application-facing API layer.
