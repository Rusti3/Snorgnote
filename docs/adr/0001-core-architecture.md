# ADR-0001: Local-first core with Vault + SQLite index

## Status

Accepted (v0.1.0)

## Context

Нужна архитектура, которая:

- сохраняет пользовательские знания в переносимом формате;
- не привязывает данные к закрытой платформе;
- масштабируется через skills и jobs.

## Decision

- Source of truth: локальный Vault (Markdown + attachments).
- Runtime index: SQLite + FTS5.
- Orchestration: events + jobs queue.
- Automation: YAML skills + Rust executors.
- UI: Tauri desktop app (React + TS), local-first.

## Consequences

Плюсы:

- переносимость данных;
- предсказуемая локальная работа;
- расширяемая skill-модель.

Минусы:

- нужно поддерживать синхронизацию Vault <-> DB;
- сложнее кроссплатформенный desktop CI/release.
