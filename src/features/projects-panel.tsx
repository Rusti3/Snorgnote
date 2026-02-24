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

type TaskDraft = {
  title: string
  status: 'todo' | 'in_progress' | 'done'
  energy: 'low' | 'medium' | 'high'
  dueAt: string
}

function emptyTaskDraft(): TaskDraft {
  return {
    title: '',
    status: 'todo',
    energy: 'medium',
    dueAt: '',
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

export function ProjectsPanel() {
  const { t } = useLocale()
  const [details, setDetails] = useState<ProjectDetails[]>([])
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [skillToRun, setSkillToRun] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({})
  const [taskCreateDrafts, setTaskCreateDrafts] = useState<Record<string, TaskDraft>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [modalNote, setModalNote] = useState<NoteDocument | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setError(null)
    try {
      const [detailsResult, skillsResult] = await Promise.all([
        api.projectsListDetails(),
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

  async function createTask(projectId: string) {
    const draft = taskCreateDrafts[projectId] ?? emptyTaskDraft()
    if (!draft.title.trim()) return
    setError(null)
    setStatus(null)
    try {
      await api.projectsTaskCreate({
        projectId,
        title: draft.title.trim(),
        status: draft.status,
        energy: draft.energy,
        dueAt: dueInputToIso(draft.dueAt),
      })
      setStatus(t('Задача создана', 'Task created'))
      setTaskCreateDrafts((current) => ({
        ...current,
        [projectId]: emptyTaskDraft(),
      }))
      await loadAll()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось создать задачу', 'Failed to create task'),
      )
    }
  }

  async function saveTask(taskId: string) {
    const draft = taskDrafts[taskId]
    if (!draft || !draft.title.trim()) return
    setError(null)
    setStatus(null)
    try {
      await api.projectsTaskUpdate(taskId, {
        title: draft.title.trim(),
        status: draft.status,
        energy: draft.energy,
        dueAt: dueInputToIso(draft.dueAt),
      })
      setStatus(t('Задача обновлена', 'Task updated'))
      await loadAll()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось обновить задачу', 'Failed to update task'),
      )
    }
  }

  async function deleteTask(taskId: string) {
    const confirmed = window.confirm(
      t('Удалить задачу?', 'Delete this task?'),
    )
    if (!confirmed) return
    setError(null)
    setStatus(null)
    try {
      await api.projectsTaskDelete(taskId)
      setStatus(t('Задача удалена', 'Task deleted'))
      await loadAll()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t('Не удалось удалить задачу', 'Failed to delete task'),
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

          return (
            <Card key={project.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleProject(project.id)}
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
                  <Badge>{t('Заметки', 'Notes')}: {projectDetails.notes.length}</Badge>
                </div>
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <p>{t('Здоровье', 'Health')}: {project.health.toFixed(1)}</p>
                <p>{t('Открытые задачи', 'Open tasks')}: {project.open_tasks}</p>
                <p>{t('Сделано сегодня', 'Done today')}: {project.done_today}</p>
                <p>{t('Всего задач', 'Total tasks')}: {projectDetails.tasks.length}</p>
              </div>

              {isExpanded ? (
                <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--card)]/30 p-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-semibold">{t('Заметки проекта', 'Project notes')}</h5>
                      <Badge>{projectDetails.notes.length}</Badge>
                    </div>
                    <VirtualList
                      items={projectDetails.notes}
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
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="text-sm font-semibold">{t('Задачи проекта', 'Project tasks')}</h5>
                      <Badge>{projectDetails.tasks.length}</Badge>
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
                      items={projectDetails.tasks}
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
                              onClick={() => void saveTask(task.id)}
                              disabled={!draft.title.trim()}
                            >
                              <Save size={14} />
                              {t('Сохранить', 'Save')}
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => void deleteTask(task.id)}
                            >
                              <Trash2 size={14} />
                              {t('Удалить', 'Delete')}
                            </Button>
                          </div>
                        )
                      }}
                    />
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
