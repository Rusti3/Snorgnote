// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocaleProvider } from '../lib/locale'
import { FlashcardsReviewWindow } from './flashcards-review-window'

const apiMock = vi.hoisted(() => ({
  flashcardsList: vi.fn(),
  flashcardsReviewNext: vi.fn(),
  flashcardsSubmitReview: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

describe('FlashcardsReviewWindow', () => {
  beforeEach(() => {
    window.localStorage.setItem('snorgnote.locale', 'en')
    apiMock.flashcardsList.mockReset()
    apiMock.flashcardsReviewNext.mockReset()
    apiMock.flashcardsSubmitReview.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('runs review flow and reaches done state when queue is empty', async () => {
    const user = userEvent.setup()
    const card = {
      id: 'card-1',
      front_md: 'Front side',
      back_md: 'Back side',
      vault_path: 'Flashcards/card-1.md',
      status: 'active' as const,
      is_manual: true,
      due_at: '2026-03-06T10:00:00Z',
      interval_days: 1,
      ease_factor: 2.5,
      reps: 0,
      lapses: 0,
      created_at: '2026-03-06T10:00:00Z',
      updated_at: '2026-03-06T10:00:00Z',
    }

    apiMock.flashcardsList
      .mockResolvedValueOnce({
        items: [card],
        total: 1,
        limit: 1,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [],
        total: 0,
        limit: 1,
        offset: 0,
      })
    apiMock.flashcardsReviewNext.mockResolvedValueOnce(card).mockResolvedValueOnce(null)
    apiMock.flashcardsSubmitReview.mockResolvedValue({
      grade: 'good',
      card: {
        ...card,
        due_at: '2026-03-07T10:00:00Z',
        reps: 1,
      },
    })

    render(
      <LocaleProvider>
        <FlashcardsReviewWindow />
      </LocaleProvider>,
    )

    await screen.findByText('Front side')
    await user.click(screen.getByRole('button', { name: 'Show answer' }))
    await screen.findByText('Back side')
    await user.click(screen.getByRole('button', { name: 'Good' }))

    await waitFor(() => {
      expect(apiMock.flashcardsSubmitReview).toHaveBeenCalledWith('card-1', 'good')
    })
    await screen.findByText('All done for today.')
  })

  it('shows done state immediately when no cards are due', async () => {
    apiMock.flashcardsList.mockResolvedValue({
      items: [],
      total: 0,
      limit: 1,
      offset: 0,
    })
    apiMock.flashcardsReviewNext.mockResolvedValue(null)

    render(
      <LocaleProvider>
        <FlashcardsReviewWindow />
      </LocaleProvider>,
    )

    await screen.findByText('All done for today.')
  })
})
