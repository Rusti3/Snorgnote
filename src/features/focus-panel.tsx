import { useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import type { FocusSessionView, FocusStats } from '../types/api'

export function FocusPanel() {
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
      setError(err instanceof Error ? err.message : 'Не удалось начать фокус')
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
        setError(`Сессия завершена: ${Math.floor(session.duration_sec / 60)} мин`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось остановить фокус')
    }
  }

  async function refreshStats() {
    setError(null)
    try {
      const next = await api.focusStats(7)
      setStats(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику фокуса')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-lg font-semibold">Помодоро / Фокус</h3>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder="project_general"
          />
          <Button onClick={() => void startFocus()} disabled={Boolean(active)}>
            Старт
          </Button>
          <Button variant="danger" onClick={() => void stopFocus()} disabled={!active}>
            Стоп
          </Button>
          <Button variant="outline" onClick={() => void refreshStats()}>
            Обновить статистику
          </Button>
        </div>

        {active ? (
          <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3">
            <p className="text-sm font-medium">Активная сессия</p>
            <p className="text-xs text-[var(--muted-foreground)]">
              начата в {new Date(active.started_at).toLocaleTimeString()}
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">Нет активной фокус-сессии.</p>
        )}

        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <Card>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Последние 7 дней
        </h4>
        {stats ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge>Сессии: {stats.sessions}</Badge>
              <Badge>Всего минут: {stats.total_minutes}</Badge>
            </div>
            <div className="space-y-1 text-sm">
              {stats.by_project.map((row) => (
                <p key={row.project_id}>
                  {row.project_id}: {row.minutes} мин
                </p>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            Нажмите &quot;Обновить статистику&quot;, чтобы загрузить историю.
          </p>
        )}
      </Card>
    </div>
  )
}
