// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocaleProvider } from '../lib/locale'
import { HabitsPanel } from './habits-panel'

const apiMock = vi.hoisted(() => ({
  habitsToday: vi.fn(),
  habitsList: vi.fn(),
  habitsCreate: vi.fn(),
  habitsUpdate: vi.fn(),
  habitsArchive: vi.fn(),
  habitsDelete: vi.fn(),
  habitsMarkDone: vi.fn(),
  habitsUnmarkDone: vi.fn(),
  projectsGetState: vi.fn(),
}))

vi.mock('../lib/api', () => ({
  api: apiMock,
}))

describe('HabitsPanel', () => {
  beforeEach(() => {
    window.localStorage.setItem('snorgnote.locale', 'en')
    vi.stubGlobal('confirm', vi.fn(() => true))

    apiMock.habitsToday.mockReset()
    apiMock.habitsList.mockReset()
    apiMock.habitsCreate.mockReset()
    apiMock.habitsUpdate.mockReset()
    apiMock.habitsArchive.mockReset()
    apiMock.habitsDelete.mockReset()
    apiMock.habitsMarkDone.mockReset()
    apiMock.habitsUnmarkDone.mockReset()
    apiMock.projectsGetState.mockReset()

    const baseHabit = {
      id: 'habit-1',
      slug: 'habit-1',
      title: 'Morning walk',
      description: '',
      frequency: { type: 'daily' as const },
      project_id: 'project_life',
      archived: false,
      created_at: '2026-03-02T08:00:00Z',
      updated_at: '2026-03-02T08:00:00Z',
    }
    apiMock.habitsToday.mockResolvedValue({
      date: '2026-03-02',
      total: 1,
      items: [
        {
          habit: baseHabit,
          is_due_today: true,
          completed_today: false,
          current_streak: 2,
        },
      ],
    })
    apiMock.habitsList.mockResolvedValue([baseHabit])
    apiMock.habitsCreate.mockResolvedValue({
      ...baseHabit,
      id: 'habit-2',
      slug: 'new-habit',
      title: 'Read book',
    })
    apiMock.habitsUpdate.mockImplementation(async (_habitId: string, input: { title: string }) => ({
      ...baseHabit,
      title: input.title,
    }))
    apiMock.habitsArchive.mockResolvedValue({
      ...baseHabit,
      archived: true,
    })
    apiMock.habitsDelete.mockResolvedValue(undefined)
    apiMock.habitsMarkDone.mockResolvedValue({
      id: 'log-1',
      habit_id: 'habit-1',
      log_date: '2026-03-02',
      done: true,
      created_at: '2026-03-02T09:00:00Z',
      updated_at: '2026-03-02T09:00:00Z',
    })
    apiMock.habitsUnmarkDone.mockResolvedValue(undefined)
    apiMock.projectsGetState.mockResolvedValue([
      {
        id: 'project_general',
        slug: 'general',
        name: 'General',
        biome_type: 'mainland',
        health: 50,
        xp: 10,
        level: 1,
        open_tasks: 1,
        done_today: 0,
      },
      {
        id: 'project_life',
        slug: 'life',
        name: 'Life',
        biome_type: 'habitat',
        health: 55,
        xp: 10,
        level: 1,
        open_tasks: 0,
        done_today: 0,
      },
    ])
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('creates a new habit from form', async () => {
    const user = userEvent.setup()
    render(
      <LocaleProvider>
        <HabitsPanel />
      </LocaleProvider>,
    )

    await screen.findByText('Habits')
    await user.type(screen.getByPlaceholderText('Habit title'), 'Read book')
    await user.click(screen.getByRole('button', { name: 'Add habit' }))

    await waitFor(() => {
      expect(apiMock.habitsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Read book',
          frequencyType: 'daily',
        }),
      )
    })
  })

  it('marks habit as done today and archives it', async () => {
    const user = userEvent.setup()
    render(
      <LocaleProvider>
        <HabitsPanel />
      </LocaleProvider>,
    )

    await screen.findByText('Morning walk')
    await user.click(screen.getByRole('button', { name: 'Done today' }))
    await waitFor(() => {
      expect(apiMock.habitsMarkDone).toHaveBeenCalledWith('habit-1')
    })

    await user.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => {
      expect(apiMock.habitsArchive).toHaveBeenCalledWith('habit-1', true)
    })
  })
})
