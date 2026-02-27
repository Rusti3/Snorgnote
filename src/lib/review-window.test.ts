import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({
  isTauri: vi.fn(),
}))

const getByLabelMock = vi.hoisted(() => vi.fn())
const createdWindows = vi.hoisted(() => [] as Array<{ label: string; options?: Record<string, unknown> }>)

vi.mock('./api', () => ({
  api: apiMock,
}))

vi.mock('@tauri-apps/api/webviewWindow', () => {
  class MockWebviewWindow {
    static getByLabel = getByLabelMock
    label: string
    options?: Record<string, unknown>

    constructor(label: string, options?: Record<string, unknown>) {
      this.label = label
      this.options = options
      createdWindows.push({ label, options })
    }
  }

  return {
    WebviewWindow: MockWebviewWindow,
  }
})

import {
  FLASHCARDS_REVIEW_WINDOW_LABEL,
  openFlashcardsReviewWindow,
} from './review-window'

describe('openFlashcardsReviewWindow', () => {
  beforeEach(() => {
    apiMock.isTauri.mockReset()
    getByLabelMock.mockReset()
    createdWindows.splice(0, createdWindows.length)
  })

  it('returns unsupported outside tauri runtime', async () => {
    apiMock.isTauri.mockReturnValue(false)

    const result = await openFlashcardsReviewWindow()

    expect(result).toBe('unsupported')
    expect(getByLabelMock).not.toHaveBeenCalled()
    expect(createdWindows).toHaveLength(0)
  })

  it('focuses existing review window when already opened', async () => {
    apiMock.isTauri.mockReturnValue(true)
    const show = vi.fn().mockResolvedValue(undefined)
    const setFocus = vi.fn().mockResolvedValue(undefined)
    getByLabelMock.mockResolvedValue({ show, setFocus })

    const result = await openFlashcardsReviewWindow()

    expect(result).toBe('focused')
    expect(getByLabelMock).toHaveBeenCalledWith(FLASHCARDS_REVIEW_WINDOW_LABEL)
    expect(show).toHaveBeenCalledTimes(1)
    expect(setFocus).toHaveBeenCalledTimes(1)
    expect(createdWindows).toHaveLength(0)
  })

  it('creates review window when it does not exist yet', async () => {
    apiMock.isTauri.mockReturnValue(true)
    getByLabelMock.mockResolvedValue(null)

    const result = await openFlashcardsReviewWindow()

    expect(result).toBe('created')
    expect(createdWindows).toHaveLength(1)
    expect(createdWindows[0]?.label).toBe(FLASHCARDS_REVIEW_WINDOW_LABEL)
    expect(createdWindows[0]?.options).toEqual(
      expect.objectContaining({
        title: 'Snorgnote - Flashcards Review',
        width: 980,
        height: 760,
        minWidth: 760,
        minHeight: 580,
        decorations: true,
      }),
    )
    expect(String(createdWindows[0]?.options?.url ?? '')).toContain('view=flashcards-review')
  })
})
