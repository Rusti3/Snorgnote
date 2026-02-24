import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type {
  FlashcardGrade,
  FlashcardPage,
  FlashcardStatus,
  FlashcardView,
} from '../types/api'

const PAGE_LIMIT = 12

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function FlashcardsPanel() {
  const { t } = useLocale()
  const [manualFront, setManualFront] = useState('')
  const [manualBack, setManualBack] = useState('')
  const [page, setPage] = useState<FlashcardPage | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [selectedCardId, setSelectedCardId] = useState<string>('')
  const [editFront, setEditFront] = useState('')
  const [editBack, setEditBack] = useState('')
  const [editStatus, setEditStatus] = useState<FlashcardStatus>('active')
  const [reviewCard, setReviewCard] = useState<FlashcardView | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [dueCount, setDueCount] = useState(0)

  const selectedCard = useMemo(
    () => page?.items.find((item) => item.id === selectedCardId) ?? null,
    [page, selectedCardId],
  )

  const hasPrev = offset > 0
  const hasNext = Boolean(page && offset + page.items.length < page.total)

  const loadCards = useCallback(async (nextOffset = offset) => {
    setLoading(true)
    setError(null)
    try {
      const [nextPage, duePage] = await Promise.all([
        api.flashcardsList({ limit: PAGE_LIMIT, offset: nextOffset }),
        api.flashcardsList({ limit: 1, offset: 0, dueOnly: true }),
      ])
      setPage(nextPage)
      setOffset(nextPage.offset)
      setDueCount(duePage.total)

      setSelectedCardId((current) => {
        if (current && nextPage.items.some((item) => item.id === current)) return current
        return nextPage.items[0]?.id ?? ''
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось загрузить карточки', 'Failed to load flashcards'))
    } finally {
      setLoading(false)
    }
  }, [offset, t])

  const loadNextReview = useCallback(async () => {
    try {
      const next = await api.flashcardsReviewNext()
      setReviewCard(next)
      setShowAnswer(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось загрузить карточку на повторение', 'Failed to load review card'))
    }
  }, [t])

  useEffect(() => {
    void loadCards(0)
    void loadNextReview()
  }, [loadCards, loadNextReview])

  useEffect(() => {
    if (!selectedCard) return
    setEditFront(selectedCard.front_md)
    setEditBack(selectedCard.back_md)
    setEditStatus(selectedCard.status)
  }, [selectedCard])

  async function createManualCard() {
    setError(null)
    setStatus(null)
    try {
      const created = await api.flashcardsCreateManual({
        frontMd: manualFront,
        backMd: manualBack,
      })
      setManualFront('')
      setManualBack('')
      setStatus(`${t('Карточка создана', 'Card created')}: ${created.id}`)
      await Promise.all([loadCards(0), loadNextReview()])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось создать карточку', 'Failed to create card'))
    }
  }

  async function saveSelectedCard() {
    if (!selectedCardId) return
    setError(null)
    setStatus(null)
    try {
      await api.flashcardsUpdate(selectedCardId, {
        frontMd: editFront,
        backMd: editBack,
        status: editStatus,
      })
      setStatus(t('Карточка обновлена', 'Card updated'))
      await Promise.all([loadCards(offset), loadNextReview()])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось обновить карточку', 'Failed to update card'))
    }
  }

  async function submitReview(grade: FlashcardGrade) {
    if (!reviewCard) return
    setError(null)
    setStatus(null)
    try {
      const result = await api.flashcardsSubmitReview(reviewCard.id, grade)
      setStatus(
        `${t('Оценка сохранена', 'Grade saved')}: ${result.grade.toUpperCase()}`,
      )
      await Promise.all([loadCards(offset), loadNextReview()])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось сохранить результат повторения', 'Failed to submit review'))
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <div className="space-y-4">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">{t('Повторение', 'Review')}</h3>
            <Badge>{t('К повтору', 'Due')}: {dueCount}</Badge>
          </div>

          {reviewCard ? (
            <div className="space-y-3">
              <div className="rounded-md border border-[var(--border)] p-3">
                <p className="mb-1 text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                  {t('Лицевая сторона', 'Front')}
                </p>
                <p className="whitespace-pre-wrap text-sm">{reviewCard.front_md}</p>
              </div>

              {showAnswer ? (
                <div className="rounded-md border border-[var(--border)] bg-[var(--muted)]/40 p-3">
                  <p className="mb-1 text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
                    {t('Обратная сторона', 'Back')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{reviewCard.back_md}</p>
                </div>
              ) : (
                <Button className="w-full" variant="outline" onClick={() => setShowAnswer(true)}>
                  {t('Показать ответ', 'Show answer')}
                </Button>
              )}

              {showAnswer ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="danger" onClick={() => void submitReview('again')}>Again</Button>
                  <Button variant="outline" onClick={() => void submitReview('hard')}>Hard</Button>
                  <Button onClick={() => void submitReview('good')}>Good</Button>
                  <Button variant="outline" onClick={() => void submitReview('easy')}>Easy</Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              {t('Сейчас нет карточек к повторению.', 'No cards are due right now.')}
            </p>
          )}
        </Card>

        <Card className="space-y-3">
          <h3 className="text-lg font-semibold">{t('Новая карточка', 'New card')}</h3>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">{t('Лицевая сторона', 'Front')}</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={manualFront}
              onChange={(event) => setManualFront(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-[var(--muted-foreground)]">{t('Обратная сторона', 'Back')}</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={manualBack}
              onChange={(event) => setManualBack(event.target.value)}
            />
          </label>
          <Button className="w-full" onClick={() => void createManualCard()}>
            {t('Создать карточку', 'Create card')}
          </Button>
        </Card>
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">{t('Библиотека карточек', 'Card library')}</h3>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void loadCards(offset)} disabled={loading}>
              {t('Обновить', 'Refresh')}
            </Button>
            <Button variant="outline" onClick={() => void loadCards(Math.max(0, offset - PAGE_LIMIT))} disabled={!hasPrev || loading}>
              {t('Назад', 'Prev')}
            </Button>
            <Button variant="outline" onClick={() => void loadCards(offset + PAGE_LIMIT)} disabled={!hasNext || loading}>
              {t('Далее', 'Next')}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
          <div className="space-y-2 rounded-md border border-[var(--border)] p-2">
            {(page?.items ?? []).map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelectedCardId(card.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedCardId === card.id
                    ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                    : 'border-[var(--border)] hover:bg-[var(--muted)]'
                }`}
              >
                <p className="line-clamp-2 font-medium">{card.front_md}</p>
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                  {t('Срок', 'Due')}: {formatDateTime(card.due_at)}
                </p>
              </button>
            ))}
            {page && page.items.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                {t('Карточек пока нет.', 'No flashcards yet.')}
              </p>
            ) : null}
          </div>

          {selectedCard ? (
            <div className="space-y-3">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">{t('Лицевая сторона', 'Front')}</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={editFront}
                  onChange={(event) => setEditFront(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">{t('Обратная сторона', 'Back')}</span>
                <textarea
                  className="min-h-32 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  value={editBack}
                  onChange={(event) => setEditBack(event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--muted-foreground)]">{t('Статус', 'Status')}</span>
                <select
                  className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value as FlashcardStatus)}
                >
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <Button onClick={() => void saveSelectedCard()}>
                {t('Сохранить изменения', 'Save changes')}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              {t('Выберите карточку для редактирования.', 'Select a card to edit.')}
            </p>
          )}
        </div>

        {status ? <p className="text-sm text-[var(--success)]">{status}</p> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>
    </div>
  )
}
