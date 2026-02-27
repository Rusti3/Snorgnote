import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

import { api } from './api'

export const FLASHCARDS_REVIEW_WINDOW_LABEL = 'flashcards-review'
export type ReviewWindowOpenResult = 'unsupported' | 'focused' | 'created'

export function buildFlashcardsReviewUrl(): string {
  if (typeof window === 'undefined') {
    return '/?view=flashcards-review'
  }
  const url = new URL(window.location.href)
  url.searchParams.set('view', 'flashcards-review')
  return url.toString()
}

export async function openFlashcardsReviewWindow(): Promise<ReviewWindowOpenResult> {
  if (!api.isTauri()) {
    return 'unsupported'
  }

  const existing = await WebviewWindow.getByLabel(FLASHCARDS_REVIEW_WINDOW_LABEL)
  if (existing) {
    await existing.show()
    await existing.setFocus()
    return 'focused'
  }

  new WebviewWindow(FLASHCARDS_REVIEW_WINDOW_LABEL, {
    url: buildFlashcardsReviewUrl(),
    title: 'Snorgnote - Flashcards Review',
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 580,
    resizable: true,
    decorations: true,
  })

  return 'created'
}
