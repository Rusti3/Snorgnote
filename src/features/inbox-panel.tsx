import { useEffect, useMemo, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import type { InboxItemView } from '../types/api'

type LoadState = 'idle' | 'loading' | 'error'

const sourceLabels: Record<string, string> = {
  quick_note: 'быстрая заметка',
  telegram: 'telegram',
  browser: 'браузер',
  email: 'почта',
}

const statusLabels: Record<string, string> = {
  new: 'новый',
  processed: 'обработан',
}

export function InboxPanel() {
  const [source, setSource] = useState('quick_note')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [items, setItems] = useState<InboxItemView[]>([])
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)

  const newCount = useMemo(
    () => items.filter((item) => item.status === 'new').length,
    [items],
  )

  async function loadInbox() {
    setState('loading')
    setError(null)
    try {
      const result = await api.inboxList()
      setItems(result)
      setState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить входящие')
      setState('error')
    }
  }

  useEffect(() => {
    void loadInbox()
  }, [])

  async function onCapture() {
    if (!content.trim()) return
    setState('loading')
    setError(null)
    try {
      await api.inboxAddItem(
        source,
        content.trim(),
        tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      )
      setContent('')
      await loadInbox()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить элемент во входящие')
      setState('error')
    }
  }

  async function onProcess() {
    setState('loading')
    setError(null)
    try {
      await api.inboxProcess(20)
      await loadInbox()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обработать входящие')
      setState('error')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Захват / Входящие</h3>
          <Badge>{newCount} новых</Badge>
        </div>
        <div className="grid gap-2 md:grid-cols-[180px_1fr]">
          <select
            className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-3"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="quick_note">быстрая заметка</option>
            <option value="telegram">telegram</option>
            <option value="browser">браузер</option>
            <option value="email">почта</option>
          </select>
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-3"
            placeholder="теги, через запятую"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </div>
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          placeholder="Добавьте сырой материал сюда..."
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void onCapture()} disabled={state === 'loading'}>
            Сохранить во входящие
          </Button>
          <Button
            variant="outline"
            onClick={() => void onProcess()}
            disabled={state === 'loading'}
          >
            Обработать очередь
          </Button>
          <Button
            variant="ghost"
            onClick={() => void loadInbox()}
            disabled={state === 'loading'}
          >
            Обновить
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <Card>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          Элементы входящих
        </h4>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Входящие пусты.</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-[var(--border)] bg-[var(--muted)]/50 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge>{sourceLabels[item.source] ?? item.source}</Badge>
                    <Badge>{statusLabels[item.status] ?? item.status}</Badge>
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{item.content_text}</p>
                {item.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags.map((tag) => (
                      <Badge key={`${item.id}-${tag}`}>{tag}</Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
