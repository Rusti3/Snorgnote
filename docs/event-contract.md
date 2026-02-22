# Event Contract (v0.1.0)

События пишутся в таблицу `events`:

- `id`
- `type`
- `entity_type`
- `entity_id`
- `payload_json`
- `created_at`

## Core event types

- `capture.received`
- `inbox.summarized`
- `tasks.extracted`
- `inbox.tagged`
- `note.saved`
- `daily.generated`
- `weekly.generated`
- `review.block_generated`
- `focus.started`
- `focus.stopped`
- `metrics.rolled_up`
- `job.completed`

## Guarantees

- Append-only лог событий.
- JSON payload на уровне event type.
- `created_at` в RFC3339 UTC.
