import { useEffect, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import type { DashboardOverview } from '../types/api'

export function StatsPanel() {
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadOverview() {
    setError(null)
    try {
      const result = await api.dashboardGetOverview()
      setOverview(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику')
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Логистическая доска / Дашборд</h3>
          <Button variant="outline" onClick={() => void loadOverview()}>
            Обновить
          </Button>
        </div>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {overview ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Проиндексировано заметок" value={overview.notes} />
            <Metric label="Новых во входящих" value={overview.inbox_new} />
            <Metric label="Задач в очереди" value={overview.jobs_queued} />
            <Metric label="Минут фокуса сегодня" value={overview.focus_minutes_today} />
            <Metric label="Повторов к выполнению" value={overview.reviews_due} />
            <Metric label="Активных проектов" value={overview.projects_active} />
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">Статистика еще не загружена.</p>
        )}
      </Card>
    </div>
  )
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3">
      <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
        {props.label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-2xl font-semibold">{props.value}</p>
        <Badge>актуально</Badge>
      </div>
    </div>
  )
}
