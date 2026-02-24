import { describe, expect, it, vi } from 'vitest'

async function loadApiModule() {
  vi.resetModules()
  const mod = await import('./api')
  return mod.api
}

describe('api flashcards mock contract', () => {
  it('creates manual card with front/back', async () => {
    const api = await loadApiModule()

    const card = await api.flashcardsCreateManual({
      frontMd: 'Front side',
      backMd: 'Back side',
    })

    expect(card.id).toBeTruthy()
    expect(card.front_md).toBe('Front side')
    expect(card.back_md).toBe('Back side')
    expect(card.status).toBe('active')
  })

  it('creates one card per selected note and links source note', async () => {
    const api = await loadApiModule()

    await api.vaultSaveNote('Notes/flash-a.md', '# A title\n\nA body')
    await api.vaultSaveNote('Notes/flash-b.md', '# B title\n\nB body')

    const report = await api.flashcardsCreateFromNotes([
      'Notes/flash-a.md',
      'Notes/flash-b.md',
    ])

    expect(report.created).toBe(2)
    expect(report.skipped_existing).toBe(0)
    expect(report.items.length).toBe(2)
    expect(report.items.every((item) => Boolean(item.source_note_path))).toBe(true)
  })

  it('skips duplicate create from the same source note', async () => {
    const api = await loadApiModule()

    await api.vaultSaveNote('Notes/flash-dup.md', '# Dup title\n\nDup body')

    const first = await api.flashcardsCreateFromNotes(['Notes/flash-dup.md'])
    expect(first.created).toBe(1)

    const second = await api.flashcardsCreateFromNotes(['Notes/flash-dup.md'])
    expect(second.created).toBe(0)
    expect(second.skipped_existing).toBe(1)
  })

  it('supports review flow with grade transitions', async () => {
    const api = await loadApiModule()

    const created = await api.flashcardsCreateManual({
      frontMd: 'Question',
      backMd: 'Answer',
    })

    const next = await api.flashcardsReviewNext()
    expect(next?.id).toBe(created.id)

    const reviewedGood = await api.flashcardsSubmitReview(created.id, 'good')
    expect(reviewedGood.grade).toBe('good')
    expect(reviewedGood.card.interval_days).toBeGreaterThanOrEqual(1)

    const reviewedEasy = await api.flashcardsSubmitReview(created.id, 'easy')
    expect(reviewedEasy.grade).toBe('easy')
    expect(reviewedEasy.card.interval_days).toBeGreaterThanOrEqual(reviewedGood.card.interval_days)
  })

  it('returns paginated cards', async () => {
    const api = await loadApiModule()

    await api.flashcardsCreateManual({ frontMd: 'A', backMd: '1' })
    await api.flashcardsCreateManual({ frontMd: 'B', backMd: '2' })

    const page = await api.flashcardsList({ limit: 1, offset: 0 })
    expect(page.limit).toBe(1)
    expect(page.offset).toBe(0)
    expect(page.total).toBeGreaterThanOrEqual(2)
    expect(page.items.length).toBe(1)
  })
})
