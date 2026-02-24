// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocaleProvider } from '../lib/locale'
import { NotesPanel } from './notes-panel'

const apiMock = vi.hoisted(() => ({
  vaultListNotes: vi.fn(),
  vaultTrashList: vi.fn(),
  projectsGetState: vi.fn(),
  vaultGetNote: vi.fn(),
  flashcardsCreateFromNotes: vi.fn(),
  projectsAssignNotes: vi.fn(),
  vaultSaveNote: vi.fn(),
  vaultDeleteNote: vi.fn(),
  vaultRestoreNote: vi.fn(),
  vaultDeleteNotePermanently: vi.fn(),
  vaultEmptyTrash: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

describe('NotesPanel', () => {
  beforeEach(() => {
    window.localStorage.setItem('snorgnote.locale', 'en')
    apiMock.vaultListNotes.mockReset()
    apiMock.vaultTrashList.mockReset()
    apiMock.projectsGetState.mockReset()
    apiMock.vaultGetNote.mockReset()
    apiMock.flashcardsCreateFromNotes.mockReset()
    apiMock.projectsAssignNotes.mockReset()
    apiMock.vaultSaveNote.mockReset()
    apiMock.vaultDeleteNote.mockReset()
    apiMock.vaultRestoreNote.mockReset()
    apiMock.vaultDeleteNotePermanently.mockReset()
    apiMock.vaultEmptyTrash.mockReset()

    apiMock.vaultListNotes.mockResolvedValue([
      { id: 'n1', path: 'Notes/a.md', title: 'Note A', updated_at: '2026-02-24T00:00:00Z' },
      { id: 'n2', path: 'Notes/b.md', title: 'Note B', updated_at: '2026-02-24T00:00:00Z' },
    ])
    apiMock.vaultTrashList.mockResolvedValue([])
    apiMock.projectsGetState.mockResolvedValue([
      {
        id: 'project_general',
        slug: 'general',
        name: 'General',
        biome_type: 'mainland',
        health: 50,
        xp: 0,
        level: 1,
        open_tasks: 0,
        done_today: 0,
      },
    ])
    apiMock.vaultGetNote.mockResolvedValue({
      id: 'n1',
      path: 'Notes/a.md',
      title: 'Note A',
      body_md: '# A',
      frontmatter: {},
      updated_at: '2026-02-24T00:00:00Z',
    })
    apiMock.projectsAssignNotes.mockResolvedValue({ updated: 1, skipped: 0 })
    apiMock.flashcardsCreateFromNotes.mockResolvedValue({
      created: 0,
      skipped_existing: 0,
      items: [],
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('assigns selected notes to selected project', async () => {
    const user = userEvent.setup()
    render(
      <LocaleProvider>
        <NotesPanel />
      </LocaleProvider>,
    )

    await screen.findByText('Vault Notes')
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThan(0)

    await user.click(checkboxes[0])
    await user.click(screen.getByRole('button', { name: 'Add to project' }))

    await waitFor(() => {
      expect(apiMock.projectsAssignNotes).toHaveBeenCalledWith('project_general', ['Notes/a.md'])
    })
  })
})
