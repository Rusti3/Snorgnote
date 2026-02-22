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
      setError(err instanceof Error ? err.message : 'Failed to load stats')
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Logistics Board / Dashboard</h3>
          <Button variant="outline" onClick={() => void loadOverview()}>
            Refresh
          </Button>
        </div>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        {overview ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="Notes indexed" value={overview.notes} />
            <Metric label="Inbox new" value={overview.inbox_new} />
            <Metric label="Jobs queued" value={overview.jobs_queued} />
            <Metric label="Focus minutes today" value={overview.focus_minutes_today} />
            <Metric label="Reviews due" value={overview.reviews_due} />
            <Metric label="Projects active" value={overview.projects_active} />
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">No stats loaded.</p>
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
        <Badge>live</Badge>
      </div>
    </div>
  )
}
