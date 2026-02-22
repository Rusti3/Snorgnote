import { useCallback, useEffect, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { DashboardOverview } from '../types/api'

export function StatsPanel() {
  const { t } = useLocale()
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadOverview = useCallback(async () => {
    setError(null)
    try {
      const result = await api.dashboardGetOverview()
      setOverview(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось загрузить статистику', 'Failed to load stats'))
    }
  }, [t])

  useEffect(() => {
    void loadOverview()
  }, [loadOverview])

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('Логистическая доска / Дашборд', 'Logistics Board / Dashboard')}</h3>
          <Button variant="outline" onClick={() => void loadOverview()}>
            {t('Обновить', 'Refresh')}
          </Button>
        </div>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {overview ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label={t('Проиндексировано заметок', 'Notes indexed')} value={overview.notes} />
            <Metric label={t('Новых во входящих', 'Inbox new')} value={overview.inbox_new} />
            <Metric label={t('Задач в очереди', 'Jobs queued')} value={overview.jobs_queued} />
            <Metric label={t('Минут фокуса сегодня', 'Focus minutes today')} value={overview.focus_minutes_today} />
            <Metric label={t('Повторов к выполнению', 'Reviews due')} value={overview.reviews_due} />
            <Metric label={t('Активных проектов', 'Projects active')} value={overview.projects_active} />
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">{t('Статистика еще не загружена.', 'No stats loaded.')}</p>
        )}
      </Card>
    </div>
  )
}

function Metric(props: { label: string; value: number }) {
  const { t } = useLocale()
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3">
      <p className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
        {props.label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-2xl font-semibold">{props.value}</p>
        <Badge>{t('актуально', 'live')}</Badge>
      </div>
    </div>
  )
}
