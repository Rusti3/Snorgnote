import { useCallback, useEffect, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { FlashcardGrade, FlashcardView } from '../types/api'

export function FlashcardsReviewWindow() {
  const { t } = useLocale()
  const [loading, setLoading] = useState(false)
  const [reviewCard, setReviewCard] = useState<FlashcardView | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [dueCount, setDueCount] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshDueCount = useCallback(async () => {
    const due = await api.flashcardsList({ dueOnly: true, limit: 1, offset: 0 })
    setDueCount(due.total)
  }, [])

  const loadNextCard = useCallback(async () => {
    const next = await api.flashcardsReviewNext()
    setReviewCard(next)
    setShowAnswer(false)
  }, [])

  const loadSession = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      await Promise.all([refreshDueCount(), loadNextCard()])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось загрузить карточки', 'Failed to load cards'))
    } finally {
      setLoading(false)
    }
  }, [loadNextCard, refreshDueCount, t])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  async function submitReview(grade: FlashcardGrade) {
    if (!reviewCard) return
    setError(null)
    setStatus(null)
    try {
      const result = await api.flashcardsSubmitReview(reviewCard.id, grade)
      setStatus(`${t('Оценка сохранена', 'Grade saved')}: ${result.grade.toUpperCase()}`)
      await Promise.all([refreshDueCount(), loadNextCard()])
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось сохранить повторение', 'Failed to save review'),
      )
    }
  }

  async function closeWindow() {
    if (!api.isTauri()) return
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось закрыть окно', 'Failed to close window'))
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] p-4 text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">{t('Повторение карточек', 'Flashcards Review')}</h2>
            <Badge>{t('К повтору', 'Due')}: {dueCount}</Badge>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--muted-foreground)]">{t('Загрузка...', 'Loading...')}</p>
          ) : null}

          {!loading && reviewCard ? (
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Button variant="danger" onClick={() => void submitReview('again')}>Again</Button>
                  <Button variant="outline" onClick={() => void submitReview('hard')}>Hard</Button>
                  <Button onClick={() => void submitReview('good')}>Good</Button>
                  <Button variant="outline" onClick={() => void submitReview('easy')}>Easy</Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {!loading && !reviewCard ? (
            <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--muted)]/20 p-4">
              <p className="text-sm font-medium">{t('На сегодня всё.', 'All done for today.')}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void loadSession()}>
                  {t('Проверить снова', 'Check again')}
                </Button>
                <Button onClick={() => void closeWindow()}>
                  {t('Закрыть окно', 'Close window')}
                </Button>
              </div>
            </div>
          ) : null}

          {status ? <p className="text-sm text-[var(--success)]">{status}</p> : null}
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        </Card>
      </div>
    </div>
  )
}
