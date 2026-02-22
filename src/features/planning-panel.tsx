import { useState } from 'react'

import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import type { DailyPlan, WeeklyPlan } from '../types/api'

export function PlanningPanel() {
  const [daily, setDaily] = useState<DailyPlan | null>(null)
  const [weekly, setWeekly] = useState<WeeklyPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function generateDaily() {
    setLoading(true)
    setError(null)
    try {
      const result = await api.plannerGenerateDaily()
      setDaily(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Daily generation failed')
    } finally {
      setLoading(false)
    }
  }

  async function generateWeekly() {
    setLoading(true)
    setError(null)
    try {
      const result = await api.plannerGenerateWeekly()
      setWeekly(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Weekly generation failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-lg font-semibold">Planning Engine</h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void generateDaily()} disabled={loading}>
            Generate Daily
          </Button>
          <Button variant="outline" onClick={() => void generateWeekly()} disabled={loading}>
            Generate Weekly
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Daily
          </h4>
          {daily ? (
            <>
              <p className="mb-2 text-sm text-[var(--muted-foreground)]">{daily.path}</p>
              <ul className="mb-3 list-disc space-y-1 pl-6 text-sm">
                {daily.suggestions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <pre className="max-h-64 overflow-auto rounded-md border border-[var(--border)] p-3 text-xs">
                {daily.markdown}
              </pre>
            </>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No daily plan generated yet.
            </p>
          )}
        </Card>

        <Card>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Weekly
          </h4>
          {weekly ? (
            <>
              <p className="mb-2 text-sm text-[var(--muted-foreground)]">{weekly.path}</p>
              <ul className="mb-3 list-disc space-y-1 pl-6 text-sm">
                {weekly.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <pre className="max-h-64 overflow-auto rounded-md border border-[var(--border)] p-3 text-xs">
                {weekly.markdown}
              </pre>
            </>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              No weekly plan generated yet.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
