# Snorgnote

Локальное open-source desktop-приложение (Tauri v2 + Rust + React/TS), которое объединяет vault заметок, pipeline обработки входящих данных, навыки-автоматизации (skills), планирование, фокус и метрики прогресса.

## Технологии

- `Tauri v2`
- `Rust core`
- `SQLite + FTS5`
- `React + TypeScript + Vite`
- `Tailwind CSS + lucide-react`

## Статус

Текущая версия: `v0.1.1`.

Реализовано:

- локальный `vault` с Markdown-заметками и индексом;
- `inbox -> jobs -> vault/tasks` конвейер;
- очередь jobs с retry и событиями;
- YAML `skills` (валидация, запуск, встроенные skills);
- генерация `Daily` и `Weekly` заметок;
- `spaced review` базовый daily-блок;
- `focus/pomodoro` старт/стоп и статистика;
- `projects` состояние (health/xp/level);
- dashboard-метрики и функциональные UI-панели.

## Быстрый запуск

```bash
npm install
npm run tauri:dev
```

Web mock режим (без Tauri runtime):

```bash
npm run dev
```

## Сводка версий (RU)

### v0.1.0

- Создана архитектурная основа приложения с Rust core и Tauri commands.
- Поднята схема SQLite/FTS5 и миграция `001_init.sql`.
- Добавлены базовые модули: vault, inbox, jobs, skills, planner, focus, dashboard.
- Добавлен UI-каркас с панелями: Inbox, Notes, Daily/Weekly, Projects, Focus, Stats.
- Добавлены начальные встроенные skills: `daily_planner`, `spaced_review`, `mood_money_events_summary`.
- Подготовлены docs и roadmap для дальнейшего расширения.

### v0.1.1

- Добавлена рабочая Telegram-интеграция для сценария `1 user + 1 bot` по `username`.
- Реализованы настройки Telegram в UI: `bot token`, `username`, генерация one-time кода, `Poll Now`, `Start/Stop listener`.
- Реализована верификация через код из лички боту и фильтрация только личных сообщений нужного username.
- Добавлен long polling listener в Rust core и запись принятых сообщений из Telegram в `Inbox`.
- Добавлена миграция `002_telegram.sql` и новые типы/команды для Telegram статуса и управления.
