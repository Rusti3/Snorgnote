import { RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { InboxItemView, TrashedInboxItem } from '../types/api'

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
  queued: 'в очереди',
}

export function InboxPanel() {
  const { locale, t } = useLocale()
  const [source, setSource] = useState('quick_note')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [items, setItems] = useState<InboxItemView[]>([])
  const [trashedItems, setTrashedItems] = useState<TrashedInboxItem[]>([])
  const [state, setState] = useState<LoadState>('idle')
  const [error, setError] = useState<string | null>(null)

  const newCount = useMemo(
    () => items.filter((item) => item.status === 'new').length,
    [items],
  )

  const loadInbox = useCallback(async () => {
    setState('loading')
    setError(null)
    try {
      const [inboxItems, trashItems] = await Promise.all([
        api.inboxList(),
        api.inboxTrashList(),
      ])
      setItems(inboxItems)
      setTrashedItems(trashItems)
      setState('idle')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('Не удалось загрузить входящие', 'Failed to load inbox'),
      )
      setState('error')
    }
  }, [t])

  useEffect(() => {
    void loadInbox()
  }, [loadInbox])

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
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось сохранить элемент во входящие', 'Failed to save inbox item'),
      )
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
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось обработать входящие', 'Failed to process inbox'),
      )
      setState('error')
    }
  }

  async function onTrash(id: string) {
    const confirmed = window.confirm(
      t('Переместить элемент во входящих в корзину?', 'Move inbox item to trash?'),
    )
    if (!confirmed) return

    setState('loading')
    setError(null)
    try {
      await api.inboxTrashItem(id)
      await loadInbox()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось удалить элемент входящих', 'Failed to delete inbox item'),
      )
      setState('error')
    }
  }

  async function onRestore(id: string) {
    setState('loading')
    setError(null)
    try {
      await api.inboxRestoreItem(id)
      await loadInbox()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось восстановить элемент', 'Failed to restore item'),
      )
      setState('error')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{t('Захват / Входящие', 'Capture / Inbox')}</h3>
          <Badge>{locale === 'ru' ? `${newCount} новых` : `${newCount} new`}</Badge>
        </div>
        <div className="grid gap-2 md:grid-cols-[180px_1fr]">
          <select
            className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-3"
            value={source}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="quick_note">{t('быстрая заметка', 'quick note')}</option>
            <option value="telegram">telegram</option>
            <option value="browser">{t('браузер', 'browser')}</option>
            <option value="email">{t('почта', 'email')}</option>
          </select>
          <input
            className="h-10 rounded-md border border-[var(--border)] bg-[var(--background)] px-3"
            placeholder={t('теги, через запятую', 'tags, comma separated')}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </div>
        <textarea
          className="mt-2 min-h-28 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
          placeholder={t('Добавьте сырой материал сюда...', 'Drop raw capture here...')}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void onCapture()} disabled={state === 'loading'}>
            {t('Сохранить во входящие', 'Save to Inbox')}
          </Button>
          <Button
            variant="outline"
            onClick={() => void onProcess()}
            disabled={state === 'loading'}
          >
            {t('Обработать очередь', 'Process Queue')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void loadInbox()}
            disabled={state === 'loading'}
          >
            {t('Обновить', 'Refresh')}
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <Card>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {t('Элементы входящих', 'Inbox Items')}
        </h4>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {t('Входящие пусты.', 'Inbox is empty.')}
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-[var(--border)] bg-[var(--muted)]/50 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge>
                      {locale === 'ru' ? (sourceLabels[item.source] ?? item.source) : item.source}
                    </Badge>
                    <Badge>
                      {locale === 'ru'
                        ? (statusLabels[item.status] ?? item.status)
                        : item.status}
                    </Badge>
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
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void onTrash(item.id)}
                    disabled={state === 'loading'}
                  >
                    <Trash2 size={14} />
                    {t('Удалить', 'Delete')}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {t('Корзина входящих', 'Inbox Trash')}
          </h4>
          <Badge>{trashedItems.length}</Badge>
        </div>
        <div className="space-y-2">
          {trashedItems.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {t('Корзина пуста.', 'Trash is empty.')}
            </p>
          ) : (
            trashedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-[var(--border)] bg-[var(--muted)]/30 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge>
                      {locale === 'ru' ? (sourceLabels[item.source] ?? item.source) : item.source}
                    </Badge>
                    <Badge>
                      {t('Было', 'Was')}: {locale === 'ru'
                        ? (statusLabels[item.previous_status] ?? item.previous_status)
                        : item.previous_status}
                    </Badge>
                  </div>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {new Date(item.deleted_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm">{item.content_text}</p>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => void onRestore(item.id)}
                  disabled={state === 'loading'}
                >
                  <RotateCcw size={14} />
                  {t('Восстановить', 'Restore')}
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  )
}
