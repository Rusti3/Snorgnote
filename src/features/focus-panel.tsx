import { useEffect, useMemo, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { FocusHistoryPage, FocusStats } from '../types/api'
import { phaseDurationSec, type PomodoroConfig, type PomodoroPhase } from './focus/pomodoro-engine'
import { usePomodoro } from './focus/use-pomodoro'
import { WatchClock } from './focus/watch-clock'

const HISTORY_PAGE_LIMIT = 8

type ConfigField = keyof PomodoroConfig

function formatRemaining(seconds: number): string {
  const clamped = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(clamped / 60)
  const sec = clamped % 60
  return `${minutes.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
}

function phaseLabel(t: (ru: string, en: string) => string, phase: PomodoroPhase): string {
  if (phase === 'focus') {
    return t('Фокус', 'Focus')
  }
  if (phase === 'short_break') {
    return t('Короткий перерыв', 'Short break')
  }
  return t('Длинный перерыв', 'Long break')
}

function coerceNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const value = Number(trimmed)
  if (!Number.isFinite(value)) {
    return null
  }
  return value
}

function formatDateTime(value?: string): string {
  if (!value) {
    return '-'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString()
}

function formatDurationMinutes(durationSec?: number): string {
  if (typeof durationSec !== 'number' || !Number.isFinite(durationSec)) {
    return '-'
  }
  const minutes = Math.max(0, Math.round(durationSec / 60))
  return `${minutes} min`
}

export function FocusPanel() {
  const { t } = useLocale()
  const [projectId, setProjectId] = useState('project_general')
  const [stats, setStats] = useState<FocusStats | null>(null)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [history, setHistory] = useState<FocusHistoryPage | null>(null)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [pendingConfig, setPendingConfig] = useState<Record<ConfigField, string>>({
    focus_min: '',
    short_break_min: '',
    long_break_min: '',
    long_break_every: '',
  })

  const pomodoro = usePomodoro(projectId)

  useEffect(() => {
    setPendingConfig({
      focus_min: String(pomodoro.config.focus_min),
      short_break_min: String(pomodoro.config.short_break_min),
      long_break_min: String(pomodoro.config.long_break_min),
      long_break_every: String(pomodoro.config.long_break_every),
    })
  }, [pomodoro.config])

  const totalSec = useMemo(
    () => phaseDurationSec(pomodoro.runtime.phase, pomodoro.config),
    [pomodoro.config, pomodoro.runtime.phase],
  )

  async function refreshStats() {
    setStatsError(null)
    try {
      const next = await api.focusStats(7)
      setStats(next)
    } catch (err) {
      setStatsError(
        err instanceof Error
          ? err.message
          : t('Не удалось загрузить статистику фокуса', 'Unable to load focus stats'),
      )
    }
  }

  async function refreshHistory(nextOffset = historyOffset) {
    setHistoryError(null)
    setHistoryLoading(true)
    try {
      const page = await api.focusHistory({
        limit: HISTORY_PAGE_LIMIT,
        offset: nextOffset,
      })
      setHistory(page)
      setHistoryOffset(page.offset)
    } catch (err) {
      setHistoryError(
        err instanceof Error
          ? err.message
          : t('Не удалось загрузить историю фокуса', 'Unable to load focus history'),
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    void refreshStats()
    void refreshHistory(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void refreshStats()
    void refreshHistory(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomodoro.statsTick])

  function applyConfigField(field: ConfigField, value: string) {
    setPendingConfig((prev) => ({ ...prev, [field]: value }))
    const numeric = coerceNumber(value)
    if (numeric === null) {
      return
    }
    pomodoro.setConfigValues({ [field]: numeric })
  }

  const canPause = pomodoro.runtime.is_running
  const canStart = !pomodoro.runtime.is_running
  const canStop = pomodoro.runtime.is_running || Boolean(pomodoro.activeSession)
  const phaseText = phaseLabel(t, pomodoro.runtime.phase)
  const hasPrevHistoryPage = historyOffset > 0
  const hasNextHistoryPage = Boolean(
    history && historyOffset + history.items.length < history.total,
  )

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden p-0">
        <div className="bg-[var(--surface-gradient)] p-4">
          <h3 className="font-display text-xl font-semibold">{t('Помодоро / Фокус', 'Pomodoro / Focus')}</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            {t(
              'Кастомный цикл с паузой и продолжением. Следующая фаза запускается вручную.',
              'Custom cycle with pause and resume. Next phase starts manually.',
            )}
          </p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(300px,420px)_1fr]">
          <WatchClock
            phase={pomodoro.runtime.phase}
            remainingSec={pomodoro.runtime.remaining_sec}
            totalSec={totalSec}
            running={pomodoro.runtime.is_running}
            caption={formatRemaining(pomodoro.runtime.remaining_sec)}
          />

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">{t('Проект', 'Project')}</span>
                <input
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  placeholder="project_general"
                />
              </label>
              <div className="space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">{t('Состояние', 'Status')}</span>
                <div className="flex flex-wrap gap-2">
                  <Badge>{phaseText}</Badge>
                  <Badge>{pomodoro.runtime.is_running ? t('Идет', 'Running') : t('Ожидание', 'Idle')}</Badge>
                  <Badge>{t('Цикл', 'Cycle')}: {pomodoro.runtime.cycle_index}</Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void pomodoro.start()} disabled={!canStart}>
                {t('Start / Resume', 'Start / Resume')}
              </Button>
              <Button variant="outline" onClick={() => void pomodoro.pause()} disabled={!canPause}>
                {t('Pause', 'Pause')}
              </Button>
              <Button variant="danger" onClick={() => void pomodoro.stop()} disabled={!canStop}>
                {t('Stop', 'Stop')}
              </Button>
              <Button variant="outline" onClick={() => void pomodoro.skip()}>
                {t('Пропустить фазу', 'Skip phase')}
              </Button>
              <Button variant="outline" onClick={() => void pomodoro.reset()}>
                {t('Сброс', 'Reset')}
              </Button>
              <Button variant="outline" onClick={() => void refreshStats()}>
                {t('Обновить статистику', 'Refresh stats')}
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">{t('Фокус (мин)', 'Focus (min)')}</span>
                <input
                  type="number"
                  min={5}
                  max={180}
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                  value={pendingConfig.focus_min}
                  onChange={(event) => applyConfigField('focus_min', event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">{t('Короткий перерыв (мин)', 'Short break (min)')}</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                  value={pendingConfig.short_break_min}
                  onChange={(event) => applyConfigField('short_break_min', event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">{t('Длинный перерыв (мин)', 'Long break (min)')}</span>
                <input
                  type="number"
                  min={5}
                  max={90}
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                  value={pendingConfig.long_break_min}
                  onChange={(event) => applyConfigField('long_break_min', event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">{t('Длинный каждые N циклов', 'Long every N cycles')}</span>
                <input
                  type="number"
                  min={2}
                  max={12}
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                  value={pendingConfig.long_break_every}
                  onChange={(event) => applyConfigField('long_break_every', event.target.value)}
                />
              </label>
            </div>

            {pomodoro.activeSession ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3 text-sm">
                <p className="font-medium">{t('Активная focus-сессия', 'Active focus session')}</p>
                <p className="text-[var(--muted-foreground)]">
                  {t('Старт', 'Started')}: {new Date(pomodoro.activeSession.started_at).toLocaleTimeString()}
                </p>
                {pomodoro.activeSession.status ? (
                  <p className="text-[var(--muted-foreground)]">
                    {t('Статус', 'Status')}: {pomodoro.activeSession.status}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                {t('Активной focus-сессии нет.', 'No active focus session.')}
              </p>
            )}

            {pomodoro.notice ? (
              <p className="text-sm text-[var(--success)]">{pomodoro.notice}</p>
            ) : null}
            {pomodoro.error ? (
              <p className="text-sm text-[var(--danger)]">{pomodoro.error}</p>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {t('Последние 7 дней', 'Last 7 Days')}
        </h4>
        {stats ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge>{t('Сессии', 'Sessions')}: {stats.sessions}</Badge>
              <Badge>{t('Всего минут', 'Total minutes')}: {stats.total_minutes}</Badge>
            </div>
            <div className="space-y-1 text-sm">
              {stats.by_project.map((row) => (
                <p key={row.project_id}>
                  {row.project_id}: {row.minutes} {t('мин', 'min')}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            {t('Нажмите "Обновить статистику", чтобы загрузить историю.', 'Press "Refresh stats" to load history.')}
          </p>
        )}
        {statsError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{statsError}</p>
        ) : null}
      </Card>

      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {t('История фокуса', 'Focus history')}
          </h4>
          <Button
            variant="outline"
            onClick={() => void refreshHistory(historyOffset)}
            disabled={historyLoading}
          >
            {t('Обновить', 'Refresh')}
          </Button>
        </div>

        {history && history.items.length > 0 ? (
          <div className="space-y-2">
            {history.items.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3 text-sm"
              >
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{item.project_id ?? t('Без проекта', 'Unassigned')}</span>
                  <Badge>{formatDurationMinutes(item.duration_sec)}</Badge>
                </div>
                <p className="text-[var(--muted-foreground)]">
                  {t('Старт', 'Started')}: {formatDateTime(item.started_at)}
                </p>
                <p className="text-[var(--muted-foreground)]">
                  {t('Финиш', 'Ended')}: {formatDateTime(item.ended_at)}
                </p>
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('Всего', 'Total')}: {history.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!hasPrevHistoryPage || historyLoading}
                  onClick={() => void refreshHistory(Math.max(0, historyOffset - HISTORY_PAGE_LIMIT))}
                >
                  {t('Назад', 'Prev')}
                </Button>
                <Button
                  variant="outline"
                  disabled={!hasNextHistoryPage || historyLoading}
                  onClick={() => void refreshHistory(historyOffset + HISTORY_PAGE_LIMIT)}
                >
                  {t('Далее', 'Next')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            {historyLoading
              ? t('Загрузка...', 'Loading...')
              : t('Пока нет завершенных focus-сессий.', 'No completed focus sessions yet.')}
          </p>
        )}

        {historyError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{historyError}</p>
        ) : null}
      </Card>
    </div>
  )
}
