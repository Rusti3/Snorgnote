# Skill Spec v1 (YAML)

Skill описывается YAML-конфигом:

```yaml
id: daily_planner
version: 1
enabled: true
inputs:
  sources: [tasks, reviews]
jobs:
  - type: plan_daily
outputs:
  - target: vault_note
    path_template: "Daily/{{date}}.md"
schedule:
  cron: "0 7 * * *"
triggers:
  - event: app.startup
```

## Supported jobs (v0.1.0)

- `summarize`
- `summarize_llm` (alias -> `summarize`)
- `tag`
- `extract_tasks`
- `extract_actions` (alias -> `extract_tasks`)
- `plan_daily`
- `plan_weekly`
- `spaced_review_select`
- `project_health_update`
- `stats_rollup`
- `aggregate` (maps to stats aggregation)

## Validation rules

- `id` не пустой.
- `version >= 1`.
- хотя бы один `jobs[]`.
- неизвестные job types помечаются warning.
