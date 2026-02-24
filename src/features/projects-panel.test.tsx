// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocaleProvider } from '../lib/locale'
import { ProjectsPanel } from './projects-panel'

const apiMock = vi.hoisted(() => ({
  projectsListDetails: vi.fn(),
  skillsList: vi.fn(),
  skillsRun: vi.fn(),
  vaultGetNote: vi.fn(),
  projectsTaskCreate: vi.fn(),
  projectsTaskUpdate: vi.fn(),
  projectsTaskDelete: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

describe('ProjectsPanel', () => {
  beforeEach(() => {
    window.localStorage.setItem('snorgnote.locale', 'en')
    vi.stubGlobal('confirm', vi.fn(() => true))

    apiMock.projectsListDetails.mockReset()
    apiMock.skillsList.mockReset()
    apiMock.skillsRun.mockReset()
    apiMock.vaultGetNote.mockReset()
    apiMock.projectsTaskCreate.mockReset()
    apiMock.projectsTaskUpdate.mockReset()
    apiMock.projectsTaskDelete.mockReset()

    apiMock.projectsListDetails.mockResolvedValue([
      {
        project: {
          id: 'project_general',
          slug: 'general',
          name: 'General',
          biome_type: 'mainland',
          health: 50,
          xp: 10,
          level: 1,
          open_tasks: 1,
          done_today: 1,
        },
        notes: [
          {
            id: 'note-1',
            path: 'Notes/alpha.md',
            title: 'Alpha note',
            updated_at: '2026-02-24T00:00:00Z',
            preview_md: 'alpha body',
          },
          {
            id: 'note-2',
            path: 'Notes/beta.md',
            title: 'Beta note',
            updated_at: '2026-02-24T00:00:00Z',
            preview_md: 'beta body',
          },
        ],
        tasks: [
          {
            id: 'task-1',
            title: 'Write docs',
            status: 'todo',
            energy: 'medium',
            due_at: undefined,
            updated_at: '2026-02-24T00:00:00Z',
          },
          {
            id: 'task-2',
            title: 'Ship release',
            status: 'done',
            energy: 'high',
            due_at: undefined,
            updated_at: '2026-02-24T00:00:00Z',
          },
        ],
      },
    ])
    apiMock.skillsList.mockResolvedValue([
      { id: 'daily_planner', slug: 'daily_planner', version: 1, enabled: true },
    ])
    apiMock.skillsRun.mockResolvedValue({
      skill_id: 'daily_planner',
      queued_jobs: 1,
      report: { processed: 1, succeeded: 1, failed: 0 },
    })
    apiMock.vaultGetNote.mockResolvedValue({
      id: 'note-1',
      path: 'Notes/alpha.md',
      title: 'Alpha note',
      body_md: '# Alpha note\n\nBody',
      frontmatter: {},
      updated_at: '2026-02-24T00:00:00Z',
    })
    apiMock.projectsTaskCreate.mockResolvedValue({
      id: 'task-3',
      title: 'New task',
      status: 'todo',
      energy: 'medium',
      due_at: undefined,
      updated_at: '2026-02-24T00:00:00Z',
    })
    apiMock.projectsTaskUpdate.mockResolvedValue({
      id: 'task-1',
      title: 'Write docs updated',
      status: 'todo',
      energy: 'medium',
      due_at: undefined,
      updated_at: '2026-02-24T00:00:00Z',
    })
    apiMock.projectsTaskDelete.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('filters notes and tasks in expanded project', async () => {
    const user = userEvent.setup()
    render(
      <LocaleProvider>
        <ProjectsPanel />
      </LocaleProvider>,
    )

    await screen.findByText('Projects / Sub-worlds')
    await user.click(screen.getByRole('button', { name: 'toggle-project-project_general' }))

    expect(screen.getByText('Alpha note')).toBeTruthy()
    expect(screen.getByText('Beta note')).toBeTruthy()

    await user.type(screen.getByPlaceholderText('Search notes'), 'alpha')
    expect(screen.getByText('Alpha note')).toBeTruthy()
    expect(screen.queryByText('Beta note')).toBeNull()

    await user.type(screen.getByPlaceholderText('Search tasks'), 'release')
    expect(screen.getByDisplayValue('Ship release')).toBeTruthy()
    expect(screen.queryByDisplayValue('Write docs')).toBeNull()
  })

  it('creates, updates and deletes project tasks', async () => {
    const user = userEvent.setup()
    render(
      <LocaleProvider>
        <ProjectsPanel />
      </LocaleProvider>,
    )

    await screen.findByText('Projects / Sub-worlds')
    await user.click(screen.getByRole('button', { name: 'toggle-project-project_general' }))

    await user.type(screen.getByPlaceholderText('New task'), 'New task')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => {
      expect(apiMock.projectsTaskCreate).toHaveBeenCalledWith({
        projectId: 'project_general',
        title: 'New task',
        status: 'todo',
        energy: 'medium',
        dueAt: null,
      })
    })

    const editableInput = screen.getByDisplayValue('Write docs')
    const editableRow = editableInput.closest('div')
    expect(editableRow).toBeTruthy()
    await user.clear(editableInput)
    await user.type(editableInput, 'Write docs updated')
    await user.click(within(editableRow as HTMLElement).getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(apiMock.projectsTaskUpdate).toHaveBeenCalledWith('task-1', {
        title: 'Write docs updated',
        status: 'todo',
        energy: 'medium',
        dueAt: null,
      })
    })

    const deleteInput = screen.getByDisplayValue('Ship release')
    const deleteRow = deleteInput.closest('div')
    expect(deleteRow).toBeTruthy()
    await user.click(within(deleteRow as HTMLElement).getByRole('button', { name: 'Delete' }))
    await waitFor(() => {
      expect(apiMock.projectsTaskDelete).toHaveBeenCalledWith('task-2')
    })
  })
})
