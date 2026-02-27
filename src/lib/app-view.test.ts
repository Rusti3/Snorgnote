import { describe, expect, it } from 'vitest'

import { resolveAppView } from './app-view'

describe('resolveAppView', () => {
  it('returns review view when query contains flashcards-review', () => {
    expect(resolveAppView('?view=flashcards-review')).toBe('flashcards-review')
    expect(resolveAppView('?foo=1&view=flashcards-review')).toBe('flashcards-review')
  })

  it('falls back to main view for unknown or missing values', () => {
    expect(resolveAppView('')).toBe('main')
    expect(resolveAppView('?view=unknown')).toBe('main')
    expect(resolveAppView('?foo=bar')).toBe('main')
  })
})
