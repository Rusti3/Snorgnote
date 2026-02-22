# Snorgnote Roadmap (v0.1.0 -> v0.2+)

## Vision

Собрать масштабируемое open-source приложение, где pipeline работает как:

`capture -> process -> organize -> act -> measure -> level up`

с локальным Vault как source of truth и расширяемыми skills/агентами.

## v0.1.0 (Foundation) — реализовано

### Core

- [x] Vault на markdown-файлах + Obsidian-style links (`[[...]]`) в индекс.
- [x] SQLite + FTS5 индекс с миграцией `src-tauri/migrations/001_init.sql`.
- [x] Таблицы для notes/inbox/events/jobs/skills/tasks/projects/focus/reviews/metrics.
- [x] Встроенные проекты и начальные skills seed.

### Orchestration

- [x] Очередь jobs со state machine (`queued/running/success/retrying/failed`).
- [x] Retry/backoff и event logging.
- [x] Job handlers: summarize, extract_tasks, tag, plan_daily, plan_weekly, spaced_review_select, project_health_update, stats_rollup.

### Planner + Focus

- [x] Daily generation (3-5 balanced suggestions + logistics block).
- [x] Weekly generation (review + next week focus).
- [x] Focus sessions start/stop + агрегированная статистика.

### Skills

- [x] YAML skill config schema.
- [x] Валидация skills.
- [x] Skills registry/list/run.
- [x] Встроенные skills: `daily_planner`, `spaced_review`, `mood_money_events_summary`.

### UI

- [x] Functional panels: Inbox, Notes, Daily/Weekly, Projects, Focus, Stats.
- [x] Tauri commands integration + web mock fallback.
- [x] Tailwind-based UI foundation + reusable primitives.

### API-ready adapters (v0.1.0 scope)

- [x] Adapter contracts + stubs (`telegram`, `email`, `browser clipper`).
- [ ] Реальные адаптеры (перенесено в v0.2+).

## v0.2.0 (Pipeline Expansion)

- [ ] Реализовать Telegram adapter (capture + ack + health).
- [ ] Реализовать Browser clipper ingestion.
- [ ] Реализовать Email ingestion (минимальный IMAP/forward flow).
- [ ] Добавить явный Logistics board UI (bottlenecks/routes/queue heatmap).
- [ ] Добавить task completion workflow в UI.
- [ ] Добавить review confirmation flow (успех/фейл -> пересчёт интервалов).

## v0.3.0 (Knowledge + RAG)

- [ ] Embeddings storage и retrieval слой (local-first).
- [ ] RAG answers with source references.
- [ ] Расширенный graph view (notes/projects/people/entities).
- [ ] Улучшенная стратегия auto-tag/entity extraction.

## v0.4.0 (Game/Meta Layer)

- [ ] Полноценный game-meta баланс (XP/resources/streaks/anti-farming).
- [ ] Биомы проектов и апгрейды инфраструктуры.
- [ ] Сценарии прогресса и достижений без искусственного фарма.

## Engineering track

- [ ] CI: lint + unit + integration + packaging checks.
- [ ] Backups/recovery и migration guards.
- [ ] Security hardening (secrets/keychain, vault boundary enforcement).
- [ ] Cross-platform parity (Linux/macOS hardening).

## Release policy

- Windows-first стабильный релиз.
- Linux/macOS на этапе best-effort build и постепенного выравнивания.
