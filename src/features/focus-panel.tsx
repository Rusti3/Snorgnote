import { useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { FocusSessionView, FocusStats } from '../types/api'

export function FocusPanel() {
  const { t } = useLocale()
  const [active, setActive] = useState<FocusSessionView | null>(null)
  const [stats, setStats] = useState<FocusStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [projectId, setProjectId] = useState('project_general')

  async function startFocus() {
    setError(null)
    try {
      const session = await api.focusStart(projectId || undefined, undefined)
      setActive(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось начать фокус', 'Unable to start focus'))
    }
  }

  async function stopFocus() {
    setError(null)
    try {
      const session = await api.focusStop()
      setActive(null)
      const newStats = await api.focusStats(7)
      setStats(newStats)
      if (session.duration_sec) {
        setError(
          localeFormatDuration(t, session.duration_sec),
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось остановить фокус', 'Unable to stop focus'))
    }
  }

  async function refreshStats() {
    setError(null)
    try {
      const next = await api.focusStats(7)
      setStats(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось загрузить статистику фокуса', 'Unable to load focus stats'))
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-lg font-semibold">{t('Помодоро / Фокус', 'Pomodoro / Focus')}</h3>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder="project_general"
          />
          <Button onClick={() => void startFocus()} disabled={Boolean(active)}>
            {t('Старт', 'Start')}
          </Button>
          <Button variant="danger" onClick={() => void stopFocus()} disabled={!active}>
            {t('Стоп', 'Stop')}
          </Button>
          <Button variant="outline" onClick={() => void refreshStats()}>
            {t('Обновить статистику', 'Refresh Stats')}
          </Button>
        </div>

        {active ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3">
            <p className="text-sm font-medium">{t('Активная сессия', 'Active session')}</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              {t('начата в', 'started at')} {new Date(active.started_at).toLocaleTimeString()}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">{t('Нет активной фокус-сессии.', 'No active focus session.')}</p>
        )}

        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
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
            {t(
              'Нажмите "Обновить статистику", чтобы загрузить историю.',
              'Press "Refresh Stats" to load history.',
            )}
          </p>
        )}
      </Card>
    </div>
  )
}

function localeFormatDuration(
  t: (ru: string, en: string) => string,
  durationSec: number,
): string {
  const minutes = Math.floor(durationSec / 60)
  return t(`Сессия завершена: ${minutes} мин`, `Session finished: ${minutes} min`)
}
