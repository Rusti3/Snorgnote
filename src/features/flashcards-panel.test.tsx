// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocaleProvider } from '../lib/locale'
import { FlashcardsPanel } from './flashcards-panel'

const apiMock = vi.hoisted(() => ({
  flashcardsList: vi.fn(),
  flashcardsReviewNext: vi.fn(),
  flashcardsCreateManual: vi.fn(),
  flashcardsUpdate: vi.fn(),
  flashcardsSubmitReview: vi.fn(),
}))

const openReviewWindowMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

vi.mock('../lib/review-window', () => ({
  openFlashcardsReviewWindow: openReviewWindowMock,
}))

describe('FlashcardsPanel', () => {
  beforeEach(() => {
    window.localStorage.setItem('snorgnote.locale', 'en')

    apiMock.flashcardsList.mockReset()
    apiMock.flashcardsReviewNext.mockReset()
    apiMock.flashcardsCreateManual.mockReset()
    apiMock.flashcardsUpdate.mockReset()
    apiMock.flashcardsSubmitReview.mockReset()
    openReviewWindowMock.mockReset()

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

    apiMock.flashcardsList.mockImplementation(async (input?: { dueOnly?: boolean }) => {
      if (input?.dueOnly) {
        return {
          items: [card],
          total: 1,
          limit: 1,
          offset: 0,
        }
      }
      return {
        items: [card],
        total: 1,
        limit: 12,
        offset: 0,
      }
    })
    apiMock.flashcardsReviewNext.mockResolvedValue(card)
    apiMock.flashcardsCreateManual.mockResolvedValue(card)
    apiMock.flashcardsUpdate.mockResolvedValue(card)
    apiMock.flashcardsSubmitReview.mockResolvedValue({
      grade: 'good',
      card: {
        ...card,
        due_at: '2026-03-07T10:00:00Z',
        reps: 1,
      },
    })
    openReviewWindowMock.mockResolvedValue('created')
  })

  afterEach(() => {
    cleanup()
  })

  it('opens separate review window from flashcards tab', async () => {
    const user = userEvent.setup()
    render(
      <LocaleProvider>
        <FlashcardsPanel />
      </LocaleProvider>,
    )

    await screen.findByText('Review')
    await user.click(screen.getByRole('button', { name: 'Open review window' }))

    await waitFor(() => {
      expect(openReviewWindowMock).toHaveBeenCalledTimes(1)
    })
  })
})
