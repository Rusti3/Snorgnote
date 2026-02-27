import { describe, expect, it, vi } from 'vitest'

async function loadApiModule() {
  vi.resetModules()
  const mod = await import('./api')
  return mod.api
}

describe('api habits mock contract', () => {
  it('supports create and update lifecycle for habit', async () => {
    const api = await loadApiModule()

    const created = await api.habitsCreate({
      title: 'Morning walk',
      description: '20 min outside',
      frequencyType: 'daily',
      projectId: 'project_life',
    })

    expect(created.id).toBeTruthy()
    expect(created.title).toBe('Morning walk')
    expect(created.project_id).toBe('project_life')
    expect(created.frequency.type).toBe('daily')
    expect(created.archived).toBe(false)

    const updated = await api.habitsUpdate(created.id, {
      title: 'Morning walk updated',
      description: '',
      frequencyType: 'every_n_days',
      intervalDays: 3,
      projectId: null,
    })

    expect(updated.title).toBe('Morning walk updated')
    expect(updated.project_id).toBeUndefined()
    expect(updated.frequency.type).toBe('every_n_days')
    expect(updated.frequency.interval_days).toBe(3)
  })

  it('supports archive and hard delete', async () => {
    const api = await loadApiModule()

    const habit = await api.habitsCreate({
      title: 'Read book',
      frequencyType: 'weekdays',
    })

    await api.habitsArchive(habit.id, true)
    const activeOnly = await api.habitsList()
    expect(activeOnly.some((item) => item.id === habit.id)).toBe(false)

    const withArchived = await api.habitsList({ includeArchived: true })
    expect(withArchived.find((item) => item.id === habit.id)?.archived).toBe(true)

    await api.habitsDelete(habit.id)
    const afterDelete = await api.habitsList({ includeArchived: true })
    expect(afterDelete.some((item) => item.id === habit.id)).toBe(false)
  })

  it('tracks completion and streak for daily habits', async () => {
    const api = await loadApiModule()

    const habit = await api.habitsCreate({
      title: 'Journal',
      frequencyType: 'daily',
    })

    await api.habitsMarkDone(habit.id, '2026-03-01')
    await api.habitsMarkDone(habit.id, '2026-03-02')
    await api.habitsMarkDone(habit.id, '2026-03-03')

    const todayPage = await api.habitsToday({ date: '2026-03-03' })
    const todayItem = todayPage.items.find((item) => item.habit.id === habit.id)
    expect(todayItem?.completed_today).toBe(true)
    expect(todayItem?.current_streak).toBe(3)

    await api.habitsUnmarkDone(habit.id, '2026-03-03')
    const afterUndo = await api.habitsToday({ date: '2026-03-03' })
    const afterUndoItem = afterUndo.items.find((item) => item.habit.id === habit.id)
    expect(afterUndoItem?.completed_today).toBe(false)
    expect(afterUndoItem?.current_streak).toBe(0)
  })

  it('calculates due flags for weekdays, custom weekdays and every_n_days', async () => {
    const api = await loadApiModule()

    const weekdaysHabit = await api.habitsCreate({
      title: 'Weekday habit',
      frequencyType: 'weekdays',
    })
    const customWeekdayHabit = await api.habitsCreate({
      title: 'Mon-Wed-Fri habit',
      frequencyType: 'custom_weekdays',
      weekdays: [1, 3, 5],
    })
    const everyTwoDaysHabit = await api.habitsCreate({
      title: 'Every two days habit',
      frequencyType: 'every_n_days',
      intervalDays: 2,
    })

    const monday = await api.habitsToday({ date: '2026-03-02' })
    const mondayWeekdays = monday.items.find((item) => item.habit.id === weekdaysHabit.id)
    const mondayCustom = monday.items.find((item) => item.habit.id === customWeekdayHabit.id)
    const mondayEveryTwo = monday.items.find((item) => item.habit.id === everyTwoDaysHabit.id)
    expect(mondayWeekdays?.is_due_today).toBe(true)
    expect(mondayCustom?.is_due_today).toBe(true)
    expect(typeof mondayEveryTwo?.is_due_today).toBe('boolean')

    const tuesday = await api.habitsToday({ date: '2026-03-03' })
    const tuesdayWeekdays = tuesday.items.find((item) => item.habit.id === weekdaysHabit.id)
    const tuesdayCustom = tuesday.items.find((item) => item.habit.id === customWeekdayHabit.id)
    expect(tuesdayWeekdays?.is_due_today).toBe(true)
    expect(tuesdayCustom?.is_due_today).toBe(false)
  })
})
