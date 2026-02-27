import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { HabitFrequencyType, HabitTodayPage, HabitView, ProjectState } from '../types/api'

type HabitFormState = {
  title: string
  description: string
  frequencyType: HabitFrequencyType
  weekdays: number[]
  intervalDays: string
  projectId: string
}

function emptyForm(): HabitFormState {
  return {
    title: '',
    description: '',
    frequencyType: 'daily',
    weekdays: [1, 3, 5],
    intervalDays: '2',
    projectId: '',
  }
}

function draftFromHabit(habit: HabitView): HabitFormState {
  return {
    title: habit.title,
    description: habit.description,
    frequencyType: habit.frequency.type,
    weekdays: [...(habit.frequency.weekdays ?? [1, 3, 5])],
    intervalDays: String(habit.frequency.interval_days ?? 2),
    projectId: habit.project_id ?? '',
  }
}

function weekdaysForLocale(t: (ru: string, en: string) => string) {
  return [
    { value: 1, label: t('Пн', 'Mon') },
    { value: 2, label: t('Вт', 'Tue') },
    { value: 3, label: t('Ср', 'Wed') },
    { value: 4, label: t('Чт', 'Thu') },
    { value: 5, label: t('Пт', 'Fri') },
    { value: 6, label: t('Сб', 'Sat') },
    { value: 7, label: t('Вс', 'Sun') },
  ]
}

function frequencyLabel(type: HabitFrequencyType, t: (ru: string, en: string) => string): string {
  if (type === 'weekdays') return t('Будни', 'Weekdays')
  if (type === 'custom_weekdays') return t('Выбранные дни', 'Custom weekdays')
  if (type === 'every_n_days') return t('Каждые N дней', 'Every N days')
  return t('Ежедневно', 'Daily')
}

export function HabitsPanel() {
  const { t } = useLocale()
  const [todayPage, setTodayPage] = useState<HabitTodayPage | null>(null)
  const [habits, setHabits] = useState<HabitView[]>([])
  const [projects, setProjects] = useState<ProjectState[]>([])
  const [createForm, setCreateForm] = useState<HabitFormState>(() => emptyForm())
  const [editDrafts, setEditDrafts] = useState<Record<string, HabitFormState>>({})
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const weekdayOptions = useMemo(() => weekdaysForLocale(t), [t])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [today, habitsList, projectsList] = await Promise.all([
        api.habitsToday(),
        api.habitsList({ includeArchived: true }),
        api.projectsGetState(),
      ])
      setTodayPage(today)
      setHabits(habitsList)
      setProjects(projectsList)
      setEditDrafts((current) => {
        const next = { ...current }
        for (const habit of habitsList) {
          if (!next[habit.id]) {
            next[habit.id] = draftFromHabit(habit)
          }
        }
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось загрузить привычки', 'Failed to load habits'))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const activeHabits = useMemo(
    () => habits.filter((habit) => !habit.archived),
    [habits],
  )
  const archivedHabits = useMemo(
    () => habits.filter((habit) => habit.archived),
    [habits],
  )

  function toggleWeekday(
    value: number,
    target: 'create' | { habitId: string },
  ) {
    const updater = (days: number[]) => {
      const has = days.includes(value)
      const next = has ? days.filter((day) => day !== value) : [...days, value]
      return next.sort((left, right) => left - right)
    }
    if (target === 'create') {
      setCreateForm((current) => ({ ...current, weekdays: updater(current.weekdays) }))
      return
    }
    setEditDrafts((current) => {
      const draft = current[target.habitId] ?? emptyForm()
      return {
        ...current,
        [target.habitId]: {
          ...draft,
          weekdays: updater(draft.weekdays),
        },
      }
    })
  }

  async function createHabit() {
    const title = createForm.title.trim()
    if (!title) return
    setError(null)
    setStatus(null)
    try {
      await api.habitsCreate({
        title,
        description: createForm.description.trim() || undefined,
        frequencyType: createForm.frequencyType,
        weekdays: createForm.frequencyType === 'custom_weekdays' ? createForm.weekdays : undefined,
        intervalDays: createForm.frequencyType === 'every_n_days'
          ? Number.parseInt(createForm.intervalDays || '2', 10)
          : undefined,
        projectId: createForm.projectId || undefined,
      })
      setCreateForm(emptyForm())
      setStatus(t('Привычка добавлена', 'Habit added'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось создать привычку', 'Failed to create habit'))
    }
  }

  async function saveHabit(habitId: string) {
    const draft = editDrafts[habitId]
    if (!draft || !draft.title.trim()) return
    setError(null)
    setStatus(null)
    try {
      await api.habitsUpdate(habitId, {
        title: draft.title.trim(),
        description: draft.description,
        frequencyType: draft.frequencyType,
        weekdays: draft.frequencyType === 'custom_weekdays' ? draft.weekdays : undefined,
        intervalDays: draft.frequencyType === 'every_n_days'
          ? Number.parseInt(draft.intervalDays || '2', 10)
          : undefined,
        projectId: draft.projectId || null,
      })
      setStatus(t('Привычка обновлена', 'Habit updated'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось обновить привычку', 'Failed to update habit'))
    }
  }

  async function archiveHabit(habitId: string, archived: boolean) {
    setError(null)
    setStatus(null)
    try {
      await api.habitsArchive(habitId, archived)
      setStatus(archived ? t('Привычка архивирована', 'Habit archived') : t('Привычка восстановлена', 'Habit restored'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось обновить архив', 'Failed to update archive'))
    }
  }

  async function deleteHabit(habitId: string) {
    const confirmed = window.confirm(
      t('Удалить привычку навсегда?', 'Delete habit permanently?'),
    )
    if (!confirmed) return
    setError(null)
    setStatus(null)
    try {
      await api.habitsDelete(habitId)
      setStatus(t('Привычка удалена', 'Habit deleted'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось удалить привычку', 'Failed to delete habit'))
    }
  }

  async function toggleDone(habitId: string, completedToday: boolean) {
    setError(null)
    setStatus(null)
    try {
      if (completedToday) {
        await api.habitsUnmarkDone(habitId)
      } else {
        await api.habitsMarkDone(habitId)
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Не удалось обновить отметку', 'Failed to update completion'))
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <h3 className="text-lg font-semibold">{t('Привычки', 'Habits')}</h3>

        <div className="grid gap-2 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
          <input
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            placeholder={t('Название привычки', 'Habit title')}
            value={createForm.title}
            onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
          />
          <input
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            placeholder={t('Описание (опционально)', 'Description (optional)')}
            value={createForm.description}
            onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
          />
          <select
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            value={createForm.frequencyType}
            onChange={(event) => setCreateForm((current) => ({
              ...current,
              frequencyType: event.target.value as HabitFrequencyType,
            }))}
          >
            <option value="daily">{t('Ежедневно', 'Daily')}</option>
            <option value="weekdays">{t('Будни', 'Weekdays')}</option>
            <option value="custom_weekdays">{t('Выбранные дни', 'Custom weekdays')}</option>
            <option value="every_n_days">{t('Каждые N дней', 'Every N days')}</option>
          </select>
          <select
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            value={createForm.projectId}
            onChange={(event) => setCreateForm((current) => ({ ...current, projectId: event.target.value }))}
          >
            <option value="">{t('Без проекта', 'No project')}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <Button onClick={() => void createHabit()} disabled={!createForm.title.trim()}>
            {t('Добавить привычку', 'Add habit')}
          </Button>
        </div>

        {createForm.frequencyType === 'custom_weekdays' ? (
          <div className="flex flex-wrap gap-2">
            {weekdayOptions.map((option) => (
              <label key={option.value} className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={createForm.weekdays.includes(option.value)}
                  onChange={() => toggleWeekday(option.value, 'create')}
                />
                {option.label}
              </label>
            ))}
          </div>
        ) : null}

        {createForm.frequencyType === 'every_n_days' ? (
          <div className="flex items-center gap-2 text-sm">
            <span>{t('Интервал (дней)', 'Interval (days)')}</span>
            <input
              type="number"
              min={2}
              className="h-9 w-28 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
              value={createForm.intervalDays}
              onChange={(event) => setCreateForm((current) => ({ ...current, intervalDays: event.target.value }))}
            />
          </div>
        ) : null}

        {status ? <p className="text-sm text-[var(--success)]">{status}</p> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <Card className="space-y-2">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {t('Сегодня', 'Today')}
        </h4>
        {todayPage?.items.length ? (
          <div className="space-y-2">
            {todayPage.items
              .filter((item) => !item.habit.archived)
              .map((item) => (
                <div
                  key={item.habit.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--background)]/70 p-2"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.habit.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
                      <Badge>{frequencyLabel(item.habit.frequency.type, t)}</Badge>
                      <Badge>{t('Streak', 'Streak')}: {item.current_streak}</Badge>
                      {item.is_due_today ? <Badge>{t('Нужно сегодня', 'Due today')}</Badge> : <Badge>{t('Не по графику', 'Not due')}</Badge>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={item.completed_today ? 'outline' : 'default'}
                    onClick={() => void toggleDone(item.habit.id, item.completed_today)}
                  >
                    {item.completed_today ? t('Отменить', 'Undo') : t('Сделано сегодня', 'Done today')}
                  </Button>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            {t('Привычек пока нет', 'No habits yet')}
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            {t('Управление привычками', 'Manage habits')}
          </h4>
          <Button size="sm" variant="outline" onClick={() => setShowArchived((current) => !current)}>
            {showArchived ? t('Скрыть архив', 'Hide archived') : t('Показать архив', 'Show archived')}
          </Button>
        </div>

        <div className="space-y-2">
          {activeHabits.map((habit) => {
            const draft = editDrafts[habit.id] ?? draftFromHabit(habit)
            return (
              <div key={habit.id} className="space-y-2 rounded-md border border-[var(--border)] p-2">
                <div className="grid gap-2 md:grid-cols-[2fr_2fr_1fr_1fr_auto_auto]">
                  <input
                    className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                    value={draft.title}
                    onChange={(event) => setEditDrafts((current) => ({
                      ...current,
                      [habit.id]: { ...draft, title: event.target.value },
                    }))}
                  />
                  <input
                    className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                    value={draft.description}
                    onChange={(event) => setEditDrafts((current) => ({
                      ...current,
                      [habit.id]: { ...draft, description: event.target.value },
                    }))}
                  />
                  <select
                    className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                    value={draft.frequencyType}
                    onChange={(event) => setEditDrafts((current) => ({
                      ...current,
                      [habit.id]: {
                        ...draft,
                        frequencyType: event.target.value as HabitFrequencyType,
                      },
                    }))}
                  >
                    <option value="daily">{t('Ежедневно', 'Daily')}</option>
                    <option value="weekdays">{t('Будни', 'Weekdays')}</option>
                    <option value="custom_weekdays">{t('Выбранные дни', 'Custom weekdays')}</option>
                    <option value="every_n_days">{t('Каждые N дней', 'Every N days')}</option>
                  </select>
                  <select
                    className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                    value={draft.projectId}
                    onChange={(event) => setEditDrafts((current) => ({
                      ...current,
                      [habit.id]: { ...draft, projectId: event.target.value },
                    }))}
                  >
                    <option value="">{t('Без проекта', 'No project')}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void saveHabit(habit.id)}
                    disabled={!draft.title.trim()}
                  >
                    {t('Сохранить', 'Save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void archiveHabit(habit.id, true)}
                  >
                    {t('В архив', 'Archive')}
                  </Button>
                </div>

                {draft.frequencyType === 'custom_weekdays' ? (
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map((option) => (
                      <label key={option.value} className="flex items-center gap-1 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.weekdays.includes(option.value)}
                          onChange={() => toggleWeekday(option.value, { habitId: habit.id })}
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                ) : null}

                {draft.frequencyType === 'every_n_days' ? (
                  <div className="flex items-center gap-2 text-sm">
                    <span>{t('Интервал (дней)', 'Interval (days)')}</span>
                    <input
                      type="number"
                      min={2}
                      className="h-9 w-28 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                      value={draft.intervalDays}
                      onChange={(event) => setEditDrafts((current) => ({
                        ...current,
                        [habit.id]: { ...draft, intervalDays: event.target.value },
                      }))}
                    />
                  </div>
                ) : null}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void deleteHabit(habit.id)}
                >
                  {t('Удалить навсегда', 'Delete permanently')}
                </Button>
              </div>
            )
          })}
        </div>

        {showArchived ? (
          <div className="space-y-2 border-t border-[var(--border)] pt-2">
            <h5 className="text-xs uppercase tracking-wider text-[var(--muted-foreground)]">
              {t('Архив', 'Archived')}
            </h5>
            {archivedHabits.length ? archivedHabits.map((habit) => (
              <div key={habit.id} className="flex items-center justify-between rounded-md border border-[var(--border)] p-2">
                <span>{habit.title}</span>
                <Button size="sm" variant="outline" onClick={() => void archiveHabit(habit.id, false)}>
                  {t('Восстановить', 'Restore')}
                </Button>
              </div>
            )) : (
              <p className="text-sm text-[var(--muted-foreground)]">{t('Архив пуст', 'Archive is empty')}</p>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  )
}
