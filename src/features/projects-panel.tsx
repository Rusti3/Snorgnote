import {
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { VirtualList } from '../components/virtual-list'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import type { NoteDocument, ProjectDetails, ProjectTaskView, SkillRecord } from '../types/api'

const PAGE_STEP = 30

type TaskDraft = {
  title: string
  status: 'todo' | 'in_progress' | 'done'
  energy: 'low' | 'medium' | 'high'
  dueAt: string
}

type ProjectFilters = {
  noteQuery: string
  taskQuery: string
  taskStatus: 'all' | 'todo' | 'in_progress' | 'done'
  taskEnergy: 'all' | 'low' | 'medium' | 'high'
}

function emptyTaskDraft(): TaskDraft {
  return {
    title: '',
    status: 'todo',
    energy: 'medium',
    dueAt: '',
  }
}

function emptyProjectFilters(): ProjectFilters {
  return {
    noteQuery: '',
    taskQuery: '',
    taskStatus: 'all',
    taskEnergy: 'all',
  }
}

function dueIsoToInput(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function dueInputToIso(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function taskToDraft(task: ProjectTaskView): TaskDraft {
  return {
    title: task.title,
    status:
      task.status === 'in_progress' || task.status === 'done'
        ? task.status
        : 'todo',
    energy:
      task.energy === 'low' || task.energy === 'high'
        ? task.energy
        : 'medium',
    dueAt: dueIsoToInput(task.due_at),
  }
}

function normalizeTaskStatus(value: string): 'todo' | 'in_progress' | 'done' {
  if (value === 'in_progress' || value === 'done') {
    return value
  }
  return 'todo'
}

function normalizeTaskEnergy(value: string): 'low' | 'medium' | 'high' {
  if (value === 'low' || value === 'high') {
    return value
  }
  return 'medium'
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of current) {
    map.set(item.id, item)
  }
  for (const item of incoming) {
    map.set(item.id, item)
  }
  return Array.from(map.values())
}

function isDoneStatus(status: string): boolean {
  return normalizeTaskStatus(status) === 'done'
}

function isTodayIso(value: string | undefined): boolean {
  if (!value) return false
  return value.startsWith(new Date().toISOString().slice(0, 10))
}

export function ProjectsPanel() {
  const { t } = useLocale()
  const [details, setDetails] = useState<ProjectDetails[]>([])
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [skillToRun, setSkillToRun] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({})
  const [taskCreateDrafts, setTaskCreateDrafts] = useState<Record<string, TaskDraft>>({})
  const [projectFilters, setProjectFilters] = useState<Record<string, ProjectFilters>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [modalNote, setModalNote] = useState<NoteDocument | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const upsertProjectDetails = useCallback(
    (next: ProjectDetails, mode: 'replace' | 'append' = 'replace') => {
      setDetails((current) => {
        const index = current.findIndex((item) => item.project.id === next.project.id)
        if (index < 0) {
          return [...current, next]
        }
        const existing = current[index]
        const merged: ProjectDetails = mode === 'append'
          ? {
              ...existing,
              ...next,
              notes: mergeById(existing.notes, next.notes),
              tasks: mergeById(existing.tasks, next.tasks),
            }
          : next
        const copy = [...current]
        copy[index] = merged
        return copy
      })
    },
    [],
  )

  const loadProjectDetails = useCallback(
    async (
      projectId: string,
      paging?: {
        notesLimit?: number
        notesOffset?: number
        tasksLimit?: number
        tasksOffset?: number
      },
      mode: 'replace' | 'append' = 'replace',
    ) => {
      const page = await api.projectsListDetails({
        projectId,
        notesLimit: paging?.notesLimit,
        notesOffset: paging?.notesOffset,
        tasksLimit: paging?.tasksLimit,
        tasksOffset: paging?.tasksOffset,
      })
      if (!page[0]) return
      upsertProjectDetails(page[0], mode)
      setTaskDrafts((current) => {
        const next = { ...current }
        for (const task of page[0].tasks) {
          if (!next[task.id]) {
            next[task.id] = taskToDraft(task)
          }
        }
        return next
      })
    },
    [upsertProjectDetails],
  )

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [detailsResult, skillsResult] = await Promise.all([
        api.projectsListDetails({
          notesLimit: PAGE_STEP,
          notesOffset: 0,
          tasksLimit: PAGE_STEP,
          tasksOffset: 0,
        }),
        api.skillsList(),
      ])
      setDetails(detailsResult)
      setSkills(skillsResult)
      setSkillToRun((current) => {
        if (current || skillsResult.length === 0) return current
        return skillsResult[0].slug
      })

      setTaskDrafts(() => {
        const next: Record<string, TaskDraft> = {}
        for (const projectDetails of detailsResult) {
          for (const task of projectDetails.tasks) {
            next[task.id] = taskToDraft(task)
          }
        }
        return next
      })
      setTaskCreateDrafts((current) => {
        const next = { ...current }
        for (const projectDetails of detailsResult) {
          if (!next[projectDetails.project.id]) {
            next[projectDetails.project.id] = emptyTaskDraft()
          }
        }
        return next
      })
      setProjectFilters((current) => {
        const next = { ...current }
        for (const projectDetails of detailsResult) {
          if (!next[projectDetails.project.id]) {
            next[projectDetails.project.id] = emptyProjectFilters()
          }
        }
        return next
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось загрузить проекты', 'Failed to load projects'),
      )
    }
  }, [t])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  function toggleProject(projectId: string) {
    setExpanded((current) => ({
      ...current,
      [projectId]: !current[projectId],
    }))
  }

  function updateTaskDraft(taskId: string, patch: Partial<TaskDraft>) {
    setTaskDrafts((current) => ({
      ...current,
      [taskId]: {
        ...(current[taskId] ?? emptyTaskDraft()),
        ...patch,
      },
    }))
  }

  function updateTaskCreateDraft(projectId: string, patch: Partial<TaskDraft>) {
    setTaskCreateDrafts((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] ?? emptyTaskDraft()),
        ...patch,
      },
    }))
  }

  function updateProjectFilters(projectId: string, patch: Partial<ProjectFilters>) {
    setProjectFilters((current) => ({
      ...current,
      [projectId]: {
        ...(current[projectId] ?? emptyProjectFilters()),
        ...patch,
      },
    }))
  }

  async function runSkill() {
    if (!skillToRun) return
    setError(null)
    setStatus(null)
    try {
      const result = await api.skillsRun(skillToRun)
      setStatus(
        t(
          `Навык ${skillToRun} выполнен. Задач: ${result.report.processed}, успешно: ${result.report.succeeded}`,
          `Skill ${skillToRun} executed. Jobs: ${result.report.processed}, success: ${result.report.succeeded}`,
        ),
      )
      await loadAll()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось запустить навык', 'Skill run failed'),
      )
    }
  }

  async function openNoteModal(path: string) {
    setModalOpen(true)
    setModalLoading(true)
    setModalNote(null)
    setError(null)
    try {
      const note = await api.vaultGetNote(path)
      setModalNote(note)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось открыть заметку', 'Failed to open note'),
      )
    } finally {
      setModalLoading(false)
    }
  }

  async function syncProject(projectId: string, baseline?: ProjectDetails) {
    const current = details.find((item) => item.project.id === projectId) ?? baseline
    const notesLimit = Math.max(PAGE_STEP, current?.notes.length ?? PAGE_STEP)
    const tasksLimit = Math.max(PAGE_STEP, current?.tasks.length ?? PAGE_STEP)
    await loadProjectDetails(
      projectId,
      {
        notesLimit,
        notesOffset: 0,
        tasksLimit,
        tasksOffset: 0,
      },
      'replace',
    )
  }

  async function createTask(projectId: string) {
    const draft = taskCreateDrafts[projectId] ?? emptyTaskDraft()
    const normalizedTitle = draft.title.trim()
    if (!normalizedTitle) return

    const baseline = details.find((item) => item.project.id === projectId)
    const snapshotDetails = details
    const snapshotDrafts = taskDrafts
    const tempId = `tmp-${crypto.randomUUID()}`
    const nowIso = new Date().toISOString()
    const optimisticTask: ProjectTaskView = {
      id: tempId,
      title: normalizedTitle,
      status: draft.status,
      energy: draft.energy,
      due_at: dueInputToIso(draft.dueAt) ?? undefined,
      updated_at: nowIso,
    }

    setError(null)
    setStatus(null)
    setTaskCreateDrafts((current) => ({
      ...current,
      [projectId]: emptyTaskDraft(),
    }))
    setTaskDrafts((current) => ({
      ...current,
      [tempId]: draft,
    }))
    setDetails((current) =>
      current.map((item) => {
        if (item.project.id !== projectId) return item
        return {
          ...item,
          tasks_total: item.tasks_total + 1,
          project: {
            ...item.project,
            open_tasks: draft.status === 'done' ? item.project.open_tasks : item.project.open_tasks + 1,
            done_today: draft.status === 'done' ? item.project.done_today + 1 : item.project.done_today,
          },
          tasks: [optimisticTask, ...item.tasks],
        }
      }),
    )

    try {
      const created = await api.projectsTaskCreate({
        projectId,
        title: normalizedTitle,
        status: draft.status,
        energy: draft.energy,
        dueAt: dueInputToIso(draft.dueAt),
      })
      setDetails((current) =>
        current.map((item) => {
          if (item.project.id !== projectId) return item
          return {
            ...item,
            tasks: item.tasks.map((task) => (
              task.id === tempId
                ? {
                    ...task,
                    ...created,
                    status: normalizeTaskStatus(created.status),
                    energy: normalizeTaskEnergy(created.energy),
                  }
                : task
            )),
          }
        }),
      )
      setTaskDrafts((current) => {
        const next = { ...current }
        delete next[tempId]
        next[created.id] = taskToDraft(created)
        return next
      })
      await syncProject(projectId, baseline)
      setStatus(t('Задача создана', 'Task created'))
    } catch (err) {
      setDetails(snapshotDetails)
      setTaskDrafts(snapshotDrafts)
      setTaskCreateDrafts((current) => ({
        ...current,
        [projectId]: draft,
      }))
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось создать задачу', 'Failed to create task'),
      )
    }
  }

  async function saveTask(projectId: string, taskId: string) {
    const draft = taskDrafts[taskId]
    if (!draft) return
    const normalizedTitle = draft.title.trim()
    if (!normalizedTitle) return

    const baseline = details.find((item) => item.project.id === projectId)
    const snapshotDetails = details
    const snapshotDrafts = taskDrafts
    const nextDueAt = dueInputToIso(draft.dueAt) ?? undefined
    const optimisticUpdatedAt = new Date().toISOString()

    setError(null)
    setStatus(null)
    setDetails((current) =>
      current.map((item) => {
        if (item.project.id !== projectId) return item
        const previousTask = item.tasks.find((task) => task.id === taskId)
        if (!previousTask) return item
        const wasDone = isDoneStatus(previousTask.status)
        const nowDone = isDoneStatus(draft.status)
        let openTasks = item.project.open_tasks
        let doneToday = item.project.done_today
        if (!wasDone && nowDone) {
          openTasks = Math.max(0, openTasks - 1)
          doneToday += 1
        } else if (wasDone && !nowDone) {
          openTasks += 1
          if (isTodayIso(previousTask.updated_at)) {
            doneToday = Math.max(0, doneToday - 1)
          }
        }
        return {
          ...item,
          project: {
            ...item.project,
            open_tasks: openTasks,
            done_today: doneToday,
          },
          tasks: item.tasks.map((task) => (
            task.id === taskId
              ? {
                  ...task,
                  title: normalizedTitle,
                  status: draft.status,
                  energy: draft.energy,
                  due_at: nextDueAt,
                  updated_at: optimisticUpdatedAt,
                }
              : task
          )),
        }
      }),
    )

    try {
      const updated = await api.projectsTaskUpdate(taskId, {
        title: normalizedTitle,
        status: draft.status,
        energy: draft.energy,
        dueAt: dueInputToIso(draft.dueAt),
      })
      setTaskDrafts((current) => ({
        ...current,
        [taskId]: taskToDraft(updated),
      }))
      await syncProject(projectId, baseline)
      setStatus(t('Задача обновлена', 'Task updated'))
    } catch (err) {
      setDetails(snapshotDetails)
      setTaskDrafts(snapshotDrafts)
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось обновить задачу', 'Failed to update task'),
      )
    }
  }

  async function deleteTask(projectId: string, taskId: string) {
    const confirmed = window.confirm(
      t('Удалить задачу?', 'Delete this task?'),
    )
    if (!confirmed) return

    const baseline = details.find((item) => item.project.id === projectId)
    const snapshotDetails = details
    const snapshotDrafts = taskDrafts

    setError(null)
    setStatus(null)
    setTaskDrafts((current) => {
      if (!(taskId in current)) return current
      const next = { ...current }
      delete next[taskId]
      return next
    })
    setDetails((current) =>
      current.map((item) => {
        if (item.project.id !== projectId) return item
        const removedTask = item.tasks.find((task) => task.id === taskId)
        if (!removedTask) return item
        const openTasks = isDoneStatus(removedTask.status)
          ? item.project.open_tasks
          : Math.max(0, item.project.open_tasks - 1)
        const doneToday = isDoneStatus(removedTask.status) && isTodayIso(removedTask.updated_at)
          ? Math.max(0, item.project.done_today - 1)
          : item.project.done_today
        return {
          ...item,
          tasks_total: Math.max(0, item.tasks_total - 1),
          project: {
            ...item.project,
            open_tasks: openTasks,
            done_today: doneToday,
          },
          tasks: item.tasks.filter((task) => task.id !== taskId),
        }
      }),
    )

    try {
      await api.projectsTaskDelete(taskId)
      await syncProject(projectId, baseline)
      setStatus(t('Задача удалена', 'Task deleted'))
    } catch (err) {
      setDetails(snapshotDetails)
      setTaskDrafts(snapshotDrafts)
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось удалить задачу', 'Failed to delete task'),
      )
    }
  }

  async function loadMoreNotes(projectId: string) {
    const current = details.find((item) => item.project.id === projectId)
    if (!current || current.notes.length >= current.notes_total) return
    setError(null)
    try {
      await loadProjectDetails(
        projectId,
        {
          notesLimit: PAGE_STEP,
          notesOffset: current.notes.length,
          tasksLimit: 0,
          tasksOffset: 0,
        },
        'append',
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось загрузить заметки', 'Failed to load notes'),
      )
    }
  }

  async function loadMoreTasks(projectId: string) {
    const current = details.find((item) => item.project.id === projectId)
    if (!current || current.tasks.length >= current.tasks_total) return
    setError(null)
    try {
      await loadProjectDetails(
        projectId,
        {
          notesLimit: 0,
          notesOffset: 0,
          tasksLimit: PAGE_STEP,
          tasksOffset: current.tasks.length,
        },
        'append',
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось загрузить задачи', 'Failed to load tasks'),
      )
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-lg font-semibold">{t('Проекты / Подмиры', 'Projects / Sub-worlds')}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
            value={skillToRun}
            onChange={(event) => setSkillToRun(event.target.value)}
          >
            {skills.map((skill) => (
              <option key={skill.id} value={skill.slug}>
                {skill.slug}
              </option>
            ))}
          </select>
          <Button onClick={() => void runSkill()} disabled={!skillToRun}>
            {t('Запустить навык', 'Run Skill')}
          </Button>
          <Button variant="outline" onClick={() => void loadAll()}>
            {t('Обновить', 'Refresh')}
          </Button>
        </div>
        {status ? <p className="mt-2 text-sm text-[var(--success)]">{status}</p> : null}
        {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      </Card>

      <div className="space-y-4">
        {details.map((projectDetails) => {
          const project = projectDetails.project
          const isExpanded = Boolean(expanded[project.id])
          const createDraft = taskCreateDrafts[project.id] ?? emptyTaskDraft()
          const filters = projectFilters[project.id] ?? emptyProjectFilters()
          const noteQuery = filters.noteQuery.trim().toLowerCase()
          const taskQuery = filters.taskQuery.trim().toLowerCase()
          const filteredNotes = projectDetails.notes.filter((note) => {
            if (!noteQuery) return true
            const haystack = `${note.title}\n${note.path}\n${note.preview_md}`.toLowerCase()
            return haystack.includes(noteQuery)
          })
          const filteredTasks = projectDetails.tasks.filter((task) => {
            const matchesQuery = !taskQuery
              || `${task.title}\n${task.status}\n${task.energy}`.toLowerCase().includes(taskQuery)
            const matchesStatus = filters.taskStatus === 'all' || task.status === filters.taskStatus
            const matchesEnergy = filters.taskEnergy === 'all' || task.energy === filters.taskEnergy
            return matchesQuery && matchesStatus && matchesEnergy
          })

          return (
            <Card key={project.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleProject(project.id)}
                    aria-label={`toggle-project-${project.id}`}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </Button>
                  <h4 className="font-semibold">{project.name}</h4>
                  <Badge>{project.biome_type}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{t('Уровень', 'Level')}: {project.level}</Badge>
                  <Badge>XP: {project.xp}</Badge>
                  <Badge>{t('Задачи', 'Tasks')}: {project.open_tasks}</Badge>
                  <Badge>{t('Заметки', 'Notes')}: {projectDetails.notes_total}</Badge>
                </div>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p>{t('Здоровье', 'Health')}: {project.health.toFixed(1)}</p>
                <p>{t('Открытые задачи', 'Open tasks')}: {project.open_tasks}</p>
                <p>{t('Сделано сегодня', 'Done today')}: {project.done_today}</p>
                <p>{t('Всего задач', 'Total tasks')}: {projectDetails.tasks_total}</p>
              </div>

              {isExpanded ? (
                <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)]/30 p-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-semibold">{t('Заметки проекта', 'Project notes')}</h5>
                      <Badge>{filteredNotes.length}/{projectDetails.notes_total}</Badge>
                    </div>
                    <input
                      className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                      placeholder={t('Поиск заметок', 'Search notes')}
                      value={filters.noteQuery}
                      onChange={(event) => updateProjectFilters(project.id, { noteQuery: event.target.value })}
                    />
                    <VirtualList
                      items={filteredNotes}
                      itemHeight={98}
                      maxHeightClassName="max-h-[32vh]"
                      getKey={(note) => note.id}
                      emptyState={(
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {t('В этом проекте пока нет заметок', 'No notes in this project yet')}
                        </p>
                      )}
                      renderItem={(note) => (
                        <button
                          className="w-full rounded-md border border-[var(--border)] bg-[var(--background)]/70 px-3 py-2 text-left transition-colors hover:bg-[var(--muted)]"
                          type="button"
                          onClick={() => void openNoteModal(note.path)}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <FileText size={14} />
                            <span className="truncate font-medium">{note.title}</span>
                          </div>
                          <p className="truncate text-xs text-[var(--muted-foreground)]">{note.path}</p>
                          <p className="line-clamp-2 text-xs text-[var(--muted-foreground)]">
                            {note.preview_md || t('Пустая заметка', 'Empty note')}
                          </p>
                        </button>
                      )}
                    />
                    {projectDetails.notes.length < projectDetails.notes_total ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void loadMoreNotes(project.id)}
                      >
                        {t('Загрузить еще заметки', 'Load more notes')}
                      </Button>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-semibold">{t('Задачи проекта', 'Project tasks')}</h5>
                      <Badge>{filteredTasks.length}/{projectDetails.tasks_total}</Badge>
                    </div>

                    <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--background)]/70 p-2 md:grid-cols-[2fr_auto_auto]">
                      <input
                        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                        placeholder={t('Поиск задач', 'Search tasks')}
                        value={filters.taskQuery}
                        onChange={(event) => updateProjectFilters(project.id, { taskQuery: event.target.value })}
                      />
                      <select
                        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                        value={filters.taskStatus}
                        onChange={(event) => updateProjectFilters(project.id, {
                          taskStatus: event.target.value as ProjectFilters['taskStatus'],
                        })}
                      >
                        <option value="all">{t('Все статусы', 'All statuses')}</option>
                        <option value="todo">todo</option>
                        <option value="in_progress">in_progress</option>
                        <option value="done">done</option>
                      </select>
                      <select
                        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                        value={filters.taskEnergy}
                        onChange={(event) => updateProjectFilters(project.id, {
                          taskEnergy: event.target.value as ProjectFilters['taskEnergy'],
                        })}
                      >
                        <option value="all">{t('Вся энергия', 'All energy')}</option>
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                    </div>

                    <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--background)]/70 p-2 md:grid-cols-[2fr_auto_auto_1fr_auto]">
                      <input
                        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                        placeholder={t('Новая задача', 'New task')}
                        value={createDraft.title}
                        onChange={(event) => updateTaskCreateDraft(project.id, { title: event.target.value })}
                      />
                      <select
                        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                        value={createDraft.status}
                        onChange={(event) => updateTaskCreateDraft(project.id, {
                          status: event.target.value as TaskDraft['status'],
                        })}
                      >
                        <option value="todo">todo</option>
                        <option value="in_progress">in_progress</option>
                        <option value="done">done</option>
                      </select>
                      <select
                        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                        value={createDraft.energy}
                        onChange={(event) => updateTaskCreateDraft(project.id, {
                          energy: event.target.value as TaskDraft['energy'],
                        })}
                      >
                        <option value="low">low</option>
                        <option value="medium">medium</option>
                        <option value="high">high</option>
                      </select>
                      <input
                        type="datetime-local"
                        className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                        value={createDraft.dueAt}
                        onChange={(event) => updateTaskCreateDraft(project.id, { dueAt: event.target.value })}
                      />
                      <Button
                        size="sm"
                        onClick={() => void createTask(project.id)}
                        disabled={!createDraft.title.trim()}
                      >
                        <Plus size={14} />
                        {t('Добавить', 'Add')}
                      </Button>
                    </div>

                    <VirtualList
                      items={filteredTasks}
                      itemHeight={132}
                      maxHeightClassName="max-h-[38vh]"
                      getKey={(task) => task.id}
                      emptyState={(
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {t('В этом проекте пока нет задач', 'No tasks in this project yet')}
                        </p>
                      )}
                      renderItem={(task) => {
                        const draft = taskDrafts[task.id] ?? taskToDraft(task)
                        return (
                          <div className="grid gap-2 rounded-md border border-[var(--border)] bg-[var(--background)]/70 p-2 md:grid-cols-[2fr_auto_auto_1fr_auto_auto]">
                            <input
                              className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                              value={draft.title}
                              onChange={(event) => updateTaskDraft(task.id, { title: event.target.value })}
                            />
                            <select
                              className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                              value={draft.status}
                              onChange={(event) => updateTaskDraft(task.id, {
                                status: event.target.value as TaskDraft['status'],
                              })}
                            >
                              <option value="todo">todo</option>
                              <option value="in_progress">in_progress</option>
                              <option value="done">done</option>
                            </select>
                            <select
                              className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                              value={draft.energy}
                              onChange={(event) => updateTaskDraft(task.id, {
                                energy: event.target.value as TaskDraft['energy'],
                              })}
                            >
                              <option value="low">low</option>
                              <option value="medium">medium</option>
                              <option value="high">high</option>
                            </select>
                            <input
                              type="datetime-local"
                              className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
                              value={draft.dueAt}
                              onChange={(event) => updateTaskDraft(task.id, { dueAt: event.target.value })}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void saveTask(project.id, task.id)}
                              disabled={!draft.title.trim()}
                            >
                              <Save size={14} />
                              {t('Сохранить', 'Save')}
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void deleteTask(project.id, task.id)}
                            >
                              <Trash2 size={14} />
                              {t('Удалить', 'Delete')}
                            </Button>
                          </div>
                        )
                      }}
                    />
                    {projectDetails.tasks.length < projectDetails.tasks_total ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void loadMoreTasks(project.id)}
                      >
                        {t('Загрузить еще задачи', 'Load more tasks')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </Card>
          )
        })}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {modalNote?.title ?? t('Загрузка заметки', 'Loading note')}
                </p>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {modalNote?.path ?? ''}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setModalOpen(false)}>
                <X size={14} />
                {t('Закрыть', 'Close')}
              </Button>
            </div>
            <div className="max-h-[70vh] overflow-auto p-4">
              {modalLoading ? (
                <p className="text-sm text-[var(--muted-foreground)]">{t('Загрузка...', 'Loading...')}</p>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                  {modalNote?.body_md ?? ''}
                </pre>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
