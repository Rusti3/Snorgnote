import { invoke } from '@tauri-apps/api/core'

import type {
  DailyPlan,
  DashboardOverview,
  FlashcardGrade,
  FlashcardPage,
  FlashcardReviewResult,
  FlashcardStatus,
  FlashcardView,
  FlashcardsCreateFromNotesReport,
  FocusActiveState,
  FocusHistoryItem,
  FocusHistoryPage,
  FocusSessionView,
  FocusStats,
  InboxItemView,
  JobRunReport,
  NoteDocument,
  NoteSummary,
  ProjectAssignNotesReport,
  ProjectDetails,
  ProjectNoteBlock,
  ProjectState,
  ProjectTaskView,
  SkillRecord,
  SkillRunResult,
  SkillValidation,
  TrashedInboxItem,
  TrashedNoteSummary,
  TelegramPollReport,
  TelegramStatus,
  TelegramVerificationCode,
  WeeklyPlan,
} from '../types/api'

const hasTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)

function durationBetweenSeconds(startedAt: string, endedAt: string): number {
  const startMs = new Date(startedAt).getTime()
  const endMs = new Date(endedAt).getTime()
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return 0
  }
  return Math.max(0, Math.floor((endMs - startMs) / 1000))
}

function computeMockElapsedSec(session: FocusSessionView, referenceAt: string): number {
  const base = durationBetweenSeconds(session.started_at, referenceAt)
  const pausedTotal = session.paused_total_sec ?? 0
  const currentPause = session.paused_at
    ? durationBetweenSeconds(session.paused_at, referenceAt)
    : 0
  return Math.max(0, base - pausedTotal - currentPause)
}

function normalizePageLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return 20
  }
  return Math.max(1, Math.min(200, Math.floor(limit)))
}

function normalizePageOffset(offset: number | undefined): number {
  if (typeof offset !== 'number' || !Number.isFinite(offset)) {
    return 0
  }
  return Math.max(0, Math.floor(offset))
}

function normalizeFlashcardStatus(status: string | undefined): FlashcardStatus {
  if (status === 'suspended' || status === 'archived') {
    return status
  }
  return 'active'
}

function compareIsoAsc(left: string, right: string): number {
  return left.localeCompare(right)
}

function normalizeProjectTaskStatus(status: string | undefined): 'todo' | 'in_progress' | 'done' {
  if (status === 'in_progress' || status === 'done') {
    return status
  }
  return 'todo'
}

function normalizeProjectTaskEnergy(energy: string | undefined): 'low' | 'medium' | 'high' {
  if (energy === 'low' || energy === 'high') {
    return energy
  }
  return 'medium'
}

function extractPreview(bodyMd: string): string {
  const compact = bodyMd
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
  if (!compact) return ''
  return compact.length > 220 ? `${compact.slice(0, 217)}...` : compact
}

function applyFlashcardGrade(card: FlashcardView, grade: FlashcardGrade): FlashcardView {
  const nowDate = new Date()
  const nowIso = nowDate.toISOString()
  const currentInterval = Math.max(0, Math.floor(card.interval_days))
  let intervalDays = currentInterval
  let easeFactor = card.ease_factor
  let reps = card.reps
  let lapses = card.lapses
  let dueAt = nowIso

  if (grade === 'again') {
    lapses += 1
    reps = 0
    intervalDays = 0
    easeFactor = Math.max(1.3, easeFactor - 0.2)
    dueAt = new Date(nowDate.getTime() + 10 * 60 * 1000).toISOString()
  } else if (grade === 'hard') {
    reps += 1
    easeFactor = Math.max(1.3, easeFactor - 0.15)
    intervalDays = Math.max(1, Math.round(Math.max(1, currentInterval) * 1.2))
    dueAt = new Date(nowDate.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString()
  } else if (grade === 'good') {
    reps += 1
    if (reps === 1) {
      intervalDays = 1
    } else if (reps === 2) {
      intervalDays = 3
    } else {
      intervalDays = Math.max(1, Math.round(Math.max(1, currentInterval) * easeFactor))
    }
    dueAt = new Date(nowDate.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString()
  } else {
    reps += 1
    easeFactor = easeFactor + 0.15
    if (reps === 1) {
      intervalDays = 4
    } else {
      intervalDays = Math.max(
        1,
        Math.round(Math.max(1, currentInterval) * easeFactor * 1.3),
      )
    }
    dueAt = new Date(nowDate.getTime() + intervalDays * 24 * 60 * 60 * 1000).toISOString()
  }

  return {
    ...card,
    due_at: dueAt,
    last_reviewed_at: nowIso,
    interval_days: intervalDays,
    ease_factor: easeFactor,
    reps,
    lapses,
    updated_at: nowIso,
  }
}

const mockState = {
  notes: [] as NoteDocument[],
  noteProjectByPath: {} as Record<string, string>,
  notesTrash: [] as Array<{
    id: string
    original_path: string
    deleted_at: string
    note: NoteDocument
    project_id?: string
  }>,
  inbox: [] as InboxItemView[],
  inboxTrash: [] as Array<{
    id: string
    deleted_at: string
    previous_status: string
  }>,
  skills: [
    { id: 'daily_planner', slug: 'daily_planner', version: 1, enabled: true },
    { id: 'spaced_review', slug: 'spaced_review', version: 1, enabled: true },
  ] as SkillRecord[],
  projects: [
    {
      id: 'project_general',
      slug: 'general',
      name: 'Общий',
      biome_type: 'mainland',
      health: 50,
      xp: 0,
      level: 1,
      open_tasks: 0,
      done_today: 0,
    },
    {
      id: 'project_life',
      slug: 'life',
      name: 'Life',
      biome_type: 'habitat',
      health: 55,
      xp: 0,
      level: 1,
      open_tasks: 0,
      done_today: 0,
    },
  ] as ProjectState[],
  projectTasks: [] as Array<ProjectTaskView & { project_id: string; created_at: string }>,
  focusActive: null as FocusSessionView | null,
  focusHistory: [] as FocusSessionView[],
  flashcards: [] as FlashcardView[],
  telegram: {
    botToken: '',
    username: '',
    verified: false,
    running: false,
    pendingCode: '',
    pendingExpiresAt: '',
    chatId: '',
    lastPollAt: '',
    lastError: '',
  },
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw new Error(extractInvokeErrorMessage(error))
  }
}

function extractInvokeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const candidates = ['message', 'error', 'reason', 'details']
    for (const key of candidates) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }
    try {
      return JSON.stringify(error)
    } catch {
      return 'неизвестная ошибка вызова'
    }
  }
  return 'неизвестная ошибка вызова'
}

export const api = {
  isTauri: hasTauriRuntime,

  async vaultListNotes(): Promise<NoteSummary[]> {
    if (hasTauriRuntime()) {
      return tauriInvoke('vault_list_notes')
    }

    return [...mockState.notes]
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((note) => ({
        id: note.id,
        path: note.path,
        title: note.title,
        updated_at: note.updated_at,
      }))
  },

  async vaultGetNote(path: string): Promise<NoteDocument> {
    if (hasTauriRuntime()) {
      return tauriInvoke('vault_get_note', { path })
    }

    const found = mockState.notes.find((note) => note.path === path)
    if (found) return found
    throw new Error(`Заметка не найдена: ${path}`)
  },

  async vaultSaveNote(path: string, bodyMd: string): Promise<NoteDocument> {
    if (hasTauriRuntime()) {
      return tauriInvoke('vault_save_note', { path, bodyMd })
    }

    const normalizedPath = path.trim().replace(/\\/g, '/')
    const title = bodyMd
      .split('\n')
      .find((line) => line.trim().startsWith('# '))
      ?.replace(/^#\s+/, '')
      ?.trim()
      || normalizedPath.replace(/\.md$/i, '').split('/').pop()
      || 'Без названия'

    const existing = mockState.notes.find((note) => note.path === normalizedPath)
    const doc: NoteDocument = {
      id: existing?.id ?? crypto.randomUUID(),
      path: normalizedPath,
      title,
      body_md: bodyMd,
      frontmatter: {},
      updated_at: now(),
    }
    const idx = mockState.notes.findIndex((note) => note.path === normalizedPath)
    if (idx >= 0) mockState.notes[idx] = doc
    else mockState.notes.push(doc)
    return doc
  },

  async vaultDeleteNote(path: string): Promise<void> {
    if (hasTauriRuntime()) {
      return tauriInvoke('vault_delete_note', { path })
    }

    const normalizedPath = path.trim().replace(/\\/g, '/')
    const idx = mockState.notes.findIndex((note) => note.path === normalizedPath)
    if (idx < 0) {
      throw new Error(`Заметка не найдена: ${normalizedPath}`)
    }
    const [note] = mockState.notes.splice(idx, 1)
    const projectId = mockState.noteProjectByPath[normalizedPath]
    delete mockState.noteProjectByPath[normalizedPath]
    mockState.notesTrash.unshift({
      id: crypto.randomUUID(),
      original_path: normalizedPath,
      deleted_at: now(),
      note,
      project_id: projectId,
    })
  },

  async vaultTrashList(): Promise<TrashedNoteSummary[]> {
    if (hasTauriRuntime()) {
      return tauriInvoke('vault_trash_list')
    }

    return mockState.notesTrash.map((entry) => ({
      id: entry.id,
      title: entry.note.title,
      original_path: entry.original_path,
      deleted_at: entry.deleted_at,
    }))
  },

  async vaultRestoreNote(trashId: string): Promise<NoteDocument> {
    if (hasTauriRuntime()) {
      return tauriInvoke('vault_restore_note', { trashId })
    }

    const idx = mockState.notesTrash.findIndex((entry) => entry.id === trashId)
    if (idx < 0) {
      throw new Error(`Элемент корзины не найден: ${trashId}`)
    }
    const [entry] = mockState.notesTrash.splice(idx, 1)
    const existingPath = mockState.notes.some((note) => note.path === entry.original_path)
    const restoredPath = existingPath
      ? entry.original_path.replace(/\.md$/i, `-restored-${Date.now()}.md`)
      : entry.original_path
    const restored: NoteDocument = {
      ...entry.note,
      path: restoredPath,
      updated_at: now(),
    }
    if (entry.project_id) {
      mockState.noteProjectByPath[restoredPath] = entry.project_id
    }
    mockState.notes.push(restored)
    return restored
  },

  async vaultDeleteNotePermanently(trashId: string): Promise<void> {
    if (hasTauriRuntime()) {
      return tauriInvoke('vault_delete_note_permanently', { trashId })
    }

    const idx = mockState.notesTrash.findIndex((entry) => entry.id === trashId)
    if (idx < 0) {
      throw new Error(`Элемент корзины не найден: ${trashId}`)
    }
    mockState.notesTrash.splice(idx, 1)
  },

  async vaultEmptyTrash(): Promise<number> {
    if (hasTauriRuntime()) {
      return tauriInvoke('vault_empty_trash')
    }

    const deleted = mockState.notesTrash.length
    mockState.notesTrash = []
    return deleted
  },

  async inboxAddItem(
    source: string,
    contentText: string,
    tags: string[],
    projectHint?: string,
  ): Promise<InboxItemView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('inbox_add_item', {
        source,
        contentText,
        tags,
        projectHint,
      })
    }

    const item: InboxItemView = {
      id: crypto.randomUUID(),
      source,
      content_text: contentText,
      created_at: now(),
      status: 'new',
      project_hint: projectHint,
      tags,
    }
    mockState.inbox.unshift(item)
    return item
  },

  async inboxList(status?: string): Promise<InboxItemView[]> {
    if (hasTauriRuntime()) {
      return tauriInvoke('inbox_list', { status })
    }

    if (!status) return mockState.inbox.filter((item) => item.status !== 'trashed')
    return mockState.inbox.filter((item) => item.status === status)
  },

  async inboxProcess(limit = 20): Promise<JobRunReport> {
    if (hasTauriRuntime()) {
      return tauriInvoke('inbox_process', { limit })
    }

    let processed = 0
    for (const item of mockState.inbox) {
      if (processed >= limit) break
      if (item.status !== 'new') continue
      item.status = 'processed'
      processed += 1
    }
    return { processed, succeeded: processed, failed: 0 }
  },

  async inboxTrashItem(id: string): Promise<void> {
    if (hasTauriRuntime()) {
      return tauriInvoke('inbox_trash_item', { id })
    }

    const item = mockState.inbox.find((candidate) => candidate.id === id)
    if (!item) {
      throw new Error(`Входящее не найдено: ${id}`)
    }
    if (item.status === 'trashed') {
      return
    }
    mockState.inboxTrash = mockState.inboxTrash.filter((entry) => entry.id !== id)
    mockState.inboxTrash.unshift({
      id,
      deleted_at: now(),
      previous_status: item.status,
    })
    item.status = 'trashed'
  },

  async inboxTrashList(): Promise<TrashedInboxItem[]> {
    if (hasTauriRuntime()) {
      return tauriInvoke('inbox_trash_list')
    }

    return mockState.inboxTrash
      .map((entry) => {
        const item = mockState.inbox.find((candidate) => candidate.id === entry.id)
        if (!item) return null
        return {
          id: item.id,
          source: item.source,
          content_text: item.content_text,
          created_at: item.created_at,
          deleted_at: entry.deleted_at,
          tags: item.tags,
          previous_status: entry.previous_status,
        } satisfies TrashedInboxItem
      })
      .filter((item): item is TrashedInboxItem => Boolean(item))
  },

  async inboxRestoreItem(id: string): Promise<InboxItemView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('inbox_restore_item', { id })
    }

    const meta = mockState.inboxTrash.find((entry) => entry.id === id)
    const item = mockState.inbox.find((candidate) => candidate.id === id)
    if (!meta || !item) {
      throw new Error(`Элемент корзины не найден: ${id}`)
    }
    item.status = meta.previous_status
    mockState.inboxTrash = mockState.inboxTrash.filter((entry) => entry.id !== id)
    return item
  },

  async inboxDeleteItemPermanently(id: string): Promise<void> {
    if (hasTauriRuntime()) {
      return tauriInvoke('inbox_delete_item_permanently', { id })
    }

    const meta = mockState.inboxTrash.find((entry) => entry.id === id)
    if (!meta) {
      throw new Error(`Элемент корзины не найден: ${id}`)
    }
    mockState.inboxTrash = mockState.inboxTrash.filter((entry) => entry.id !== id)
    mockState.inbox = mockState.inbox.filter((item) => item.id !== id)
  },

  async inboxEmptyTrash(): Promise<number> {
    if (hasTauriRuntime()) {
      return tauriInvoke('inbox_empty_trash')
    }

    const ids = new Set(mockState.inboxTrash.map((entry) => entry.id))
    const deleted = ids.size
    mockState.inbox = mockState.inbox.filter((item) => !ids.has(item.id))
    mockState.inboxTrash = []
    return deleted
  },

  async skillsList(): Promise<SkillRecord[]> {
    if (hasTauriRuntime()) {
      return tauriInvoke('skills_list')
    }
    return mockState.skills
  },

  async skillsValidate(yaml: string): Promise<SkillValidation> {
    if (hasTauriRuntime()) {
      return tauriInvoke('skills_validate', { yaml })
    }
    const hasJobs = yaml.includes('jobs:')
    return {
      valid: hasJobs,
      parsed_id: yaml.match(/id:\s*([^\n]+)/)?.[1]?.trim(),
      errors: hasJobs ? [] : ['нужно определить хотя бы одну job'],
      warnings: [],
    }
  },

  async skillsRun(slug: string): Promise<SkillRunResult> {
    if (hasTauriRuntime()) {
      return tauriInvoke('skills_run', { slug })
    }
    return {
      skill_id: slug,
      queued_jobs: 1,
      report: { processed: 1, succeeded: 1, failed: 0 },
    }
  },

  async plannerGenerateDaily(): Promise<DailyPlan> {
    if (hasTauriRuntime()) {
      return tauriInvoke('planner_generate_daily')
    }
    return {
      date: today(),
      path: `Daily/${today()}.md`,
      suggestions: [
        'Важное: Сделать один значимый результат',
        'Легкое: Разобрать один кластер входящих',
        'Восстановление: 20-минутная прогулка',
      ],
      markdown: '# День\n\n- [ ] Важная задача',
    }
  },

  async plannerGenerateWeekly(): Promise<WeeklyPlan> {
    if (hasTauriRuntime()) {
      return tauriInvoke('planner_generate_weekly')
    }
    const week = `${new Date().getUTCFullYear()}-W01`
    return {
      week,
      path: `Weekly/${week}.md`,
      highlights: ['Выполнено задач: 0', 'Минут фокуса: 0'],
      markdown: '# Неделя\n',
    }
  },

  async focusStart(projectId?: string, taskId?: string): Promise<FocusSessionView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('focus_start', { projectId, taskId })
    }
    if (mockState.focusActive) {
      throw new Error('Фокус-сессия уже запущена')
    }
    const session: FocusSessionView = {
      id: crypto.randomUUID(),
      project_id: projectId,
      task_id: taskId,
      started_at: now(),
      paused_total_sec: 0,
      status: 'running',
      elapsed_sec: 0,
    }
    mockState.focusActive = session
    return session
  },

  async focusPause(): Promise<FocusSessionView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('focus_pause')
    }
    if (!mockState.focusActive) {
      throw new Error('Нет активной фокус-сессии')
    }
    if (mockState.focusActive.paused_at) {
      throw new Error('Фокус-сессия уже на паузе')
    }

    const pausedAt = now()
    const next: FocusSessionView = {
      ...mockState.focusActive,
      paused_at: pausedAt,
      status: 'paused',
      elapsed_sec: computeMockElapsedSec(mockState.focusActive, pausedAt),
    }
    mockState.focusActive = next
    return next
  },

  async focusResume(): Promise<FocusSessionView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('focus_resume')
    }
    if (!mockState.focusActive) {
      throw new Error('Нет активной фокус-сессии')
    }
    if (!mockState.focusActive.paused_at) {
      throw new Error('Активная сессия не находится на паузе')
    }

    const resumedAt = now()
    const pausedDelta = durationBetweenSeconds(mockState.focusActive.paused_at, resumedAt)
    const pausedTotal = (mockState.focusActive.paused_total_sec ?? 0) + pausedDelta
    const next: FocusSessionView = {
      ...mockState.focusActive,
      paused_at: undefined,
      paused_total_sec: pausedTotal,
      status: 'running',
      elapsed_sec: computeMockElapsedSec(
        {
          ...mockState.focusActive,
          paused_at: undefined,
          paused_total_sec: pausedTotal,
        },
        resumedAt,
      ),
    }
    mockState.focusActive = next
    return next
  },

  async focusActive(): Promise<FocusActiveState> {
    if (hasTauriRuntime()) {
      const session = await tauriInvoke<FocusSessionView | null>('focus_active')
      if (!session) {
        return { active: false }
      }
      return { active: true, session }
    }

    if (!mockState.focusActive) {
      return { active: false }
    }

    const referenceAt = now()
    const status: FocusSessionView['status'] = mockState.focusActive.paused_at
      ? 'paused'
      : 'running'
    const session: FocusSessionView = {
      ...mockState.focusActive,
      status,
      elapsed_sec: computeMockElapsedSec(mockState.focusActive, referenceAt),
    }
    mockState.focusActive = session
    return {
      active: true,
      session,
    }
  },

  async focusStop(): Promise<FocusSessionView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('focus_stop')
    }
    if (!mockState.focusActive) {
      throw new Error('Нет активной фокус-сессии')
    }

    const endedAt = now()
    const extraPaused = mockState.focusActive.paused_at
      ? durationBetweenSeconds(mockState.focusActive.paused_at, endedAt)
      : 0
    const pausedTotal = (mockState.focusActive.paused_total_sec ?? 0) + extraPaused
    const baseDuration = durationBetweenSeconds(mockState.focusActive.started_at, endedAt)
    const durationSec = Math.max(0, baseDuration - pausedTotal)

    const ended: FocusSessionView = {
      ...mockState.focusActive,
      ended_at: endedAt,
      paused_at: undefined,
      paused_total_sec: pausedTotal,
      duration_sec: durationSec,
      status: 'stopped',
      elapsed_sec: durationSec,
    }
    mockState.focusHistory.push(ended)
    mockState.focusActive = null
    return ended
  },

  async focusStats(days = 7): Promise<FocusStats> {
    if (hasTauriRuntime()) {
      return tauriInvoke('focus_stats', { days })
    }
    const totalMinutes = Math.floor(
      mockState.focusHistory.reduce(
        (acc, session) => acc + (session.duration_sec ?? 0),
        0,
      ) / 60,
    )
    return {
      sessions: mockState.focusHistory.length,
      total_minutes: totalMinutes,
      by_project: [],
    }
  },

  async focusHistory(input?: {
    limit?: number
    offset?: number
    projectId?: string
    startedFrom?: string
    startedTo?: string
  }): Promise<FocusHistoryPage> {
    const limit = normalizePageLimit(input?.limit)
    const offset = normalizePageOffset(input?.offset)
    const projectId = input?.projectId?.trim() || undefined
    const startedFrom = input?.startedFrom
    const startedTo = input?.startedTo

    if (hasTauriRuntime()) {
      return tauriInvoke('focus_history', {
        limit,
        offset,
        projectId,
        startedFrom,
        startedTo,
      })
    }

    const sorted = [...mockState.focusHistory]
      .filter((session) => Boolean(session.ended_at))
      .filter((session) => !projectId || session.project_id === projectId)
      .filter((session) => !startedFrom || session.started_at >= startedFrom)
      .filter((session) => !startedTo || session.started_at <= startedTo)
      .sort((left, right) => {
        const rightEnded = right.ended_at ?? right.started_at
        const leftEnded = left.ended_at ?? left.started_at
        return rightEnded.localeCompare(leftEnded)
      })

    const total = sorted.length
    const items: FocusHistoryItem[] = sorted
      .slice(offset, offset + limit)
      .map((session) => ({
        id: session.id,
        project_id: session.project_id,
        task_id: session.task_id,
        started_at: session.started_at,
        ended_at: session.ended_at,
        paused_total_sec: session.paused_total_sec ?? 0,
        duration_sec: session.duration_sec,
      }))

    return {
      items,
      total,
      limit,
      offset,
    }
  },

  async flashcardsCreateManual(input: {
    frontMd: string
    backMd: string
  }): Promise<FlashcardView> {
    const frontMd = input.frontMd.trim()
    const backMd = input.backMd.trim()
    if (!frontMd) {
      throw new Error('Лицевая сторона карточки не может быть пустой')
    }
    if (!backMd) {
      throw new Error('Обратная сторона карточки не может быть пустой')
    }

    if (hasTauriRuntime()) {
      return tauriInvoke('flashcards_create_manual', { frontMd, backMd })
    }

    const timestamp = now()
    const id = crypto.randomUUID()
    const card: FlashcardView = {
      id,
      front_md: frontMd,
      back_md: backMd,
      vault_path: `Flashcards/${id}.md`,
      status: 'active',
      is_manual: true,
      due_at: timestamp,
      interval_days: 0,
      ease_factor: 2.5,
      reps: 0,
      lapses: 0,
      created_at: timestamp,
      updated_at: timestamp,
    }
    mockState.flashcards.unshift(card)
    return card
  },

  async flashcardsCreateFromNotes(notePaths: string[]): Promise<FlashcardsCreateFromNotesReport> {
    const normalized = Array.from(
      new Set(
        notePaths
          .map((path) => path.trim().replaceAll('\\', '/'))
          .filter((path) => Boolean(path)),
      ),
    )
    if (hasTauriRuntime()) {
      return tauriInvoke('flashcards_create_from_notes', { notePaths: normalized })
    }

    const items: FlashcardView[] = []
    let skippedExisting = 0
    for (const path of normalized) {
      const note = mockState.notes.find((candidate) => candidate.path === path)
      if (!note) {
        throw new Error(`Заметка не найдена: ${path}`)
      }
      const exists = mockState.flashcards.some(
        (card) => card.source_note_id === note.id || card.source_note_path === note.path,
      )
      if (exists) {
        skippedExisting += 1
        continue
      }
      const timestamp = now()
      const id = crypto.randomUUID()
      const card: FlashcardView = {
        id,
        front_md: note.title,
        back_md: note.body_md,
        source_note_id: note.id,
        source_note_path: note.path,
        vault_path: `Flashcards/${id}.md`,
        status: 'active',
        is_manual: false,
        due_at: timestamp,
        interval_days: 0,
        ease_factor: 2.5,
        reps: 0,
        lapses: 0,
        created_at: timestamp,
        updated_at: timestamp,
      }
      mockState.flashcards.unshift(card)
      items.push(card)
    }

    return {
      created: items.length,
      skipped_existing: skippedExisting,
      items,
    }
  },

  async flashcardsList(input?: {
    limit?: number
    offset?: number
    dueOnly?: boolean
    query?: string
    sourceNotePath?: string
  }): Promise<FlashcardPage> {
    const limit = normalizePageLimit(input?.limit)
    const offset = normalizePageOffset(input?.offset)
    const dueOnly = Boolean(input?.dueOnly)
    const query = input?.query?.trim().toLowerCase()
    const sourceNotePath = input?.sourceNotePath?.trim()

    if (hasTauriRuntime()) {
      return tauriInvoke('flashcards_list', {
        limit,
        offset,
        dueOnly,
        query: query || undefined,
        sourceNotePath,
      })
    }

    const nowIso = now()
    const filtered = mockState.flashcards
      .filter((card) => !dueOnly || compareIsoAsc(card.due_at, nowIso) <= 0)
      .filter((card) => !sourceNotePath || card.source_note_path === sourceNotePath)
      .filter((card) => {
        if (!query) return true
        const haystack = `${card.front_md}\n${card.back_md}`.toLowerCase()
        return haystack.includes(query)
      })
      .sort((left, right) => {
        const byDue = compareIsoAsc(left.due_at, right.due_at)
        if (byDue !== 0) return byDue
        return compareIsoAsc(right.created_at, left.created_at)
      })

    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length,
      limit,
      offset,
    }
  },

  async flashcardsGet(cardId: string): Promise<FlashcardView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('flashcards_get', { cardId })
    }
    const card = mockState.flashcards.find((candidate) => candidate.id === cardId)
    if (!card) {
      throw new Error(`Карточка не найдена: ${cardId}`)
    }
    return card
  },

  async flashcardsUpdate(
    cardId: string,
    input: {
      frontMd?: string
      backMd?: string
      status?: FlashcardStatus
    },
  ): Promise<FlashcardView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('flashcards_update', {
        cardId,
        frontMd: input.frontMd,
        backMd: input.backMd,
        status: input.status,
      })
    }

    const idx = mockState.flashcards.findIndex((candidate) => candidate.id === cardId)
    if (idx < 0) {
      throw new Error(`Карточка не найдена: ${cardId}`)
    }
    const current = mockState.flashcards[idx]
    const next: FlashcardView = {
      ...current,
      front_md: input.frontMd?.trim() || current.front_md,
      back_md: input.backMd?.trim() || current.back_md,
      status: normalizeFlashcardStatus(input.status),
      updated_at: now(),
    }
    if (!next.front_md.trim() || !next.back_md.trim()) {
      throw new Error('Стороны карточки не могут быть пустыми')
    }
    mockState.flashcards[idx] = next
    return next
  },

  async flashcardsReviewNext(): Promise<FlashcardView | null> {
    if (hasTauriRuntime()) {
      return tauriInvoke('flashcards_review_next')
    }
    const nowIso = now()
    const due = mockState.flashcards
      .filter((card) => card.status === 'active')
      .filter((card) => compareIsoAsc(card.due_at, nowIso) <= 0)
      .sort((left, right) => compareIsoAsc(left.due_at, right.due_at))
    return due[0] ?? null
  },

  async flashcardsSubmitReview(
    cardId: string,
    grade: FlashcardGrade,
  ): Promise<FlashcardReviewResult> {
    if (hasTauriRuntime()) {
      return tauriInvoke('flashcards_submit_review', { cardId, grade })
    }

    const idx = mockState.flashcards.findIndex((candidate) => candidate.id === cardId)
    if (idx < 0) {
      throw new Error(`Карточка не найдена: ${cardId}`)
    }
    const current = mockState.flashcards[idx]
    if (current.status !== 'active') {
      throw new Error('Только активные карточки можно отправлять на повторение')
    }
    const updated = applyFlashcardGrade(current, grade)
    mockState.flashcards[idx] = updated
    return { grade, card: updated }
  },

  async dashboardGetOverview(): Promise<DashboardOverview> {
    if (hasTauriRuntime()) {
      return tauriInvoke('dashboard_get_overview')
    }
    return {
      notes: mockState.notes.length,
      inbox_new: mockState.inbox.filter((item) => item.status === 'new').length,
      jobs_queued: 0,
      focus_minutes_today: 0,
      reviews_due: 0,
      projects_active: mockState.projects.length,
    }
  },

  async projectsGetState(): Promise<ProjectState[]> {
    if (hasTauriRuntime()) {
      return tauriInvoke('projects_get_state')
    }

    const todayPrefix = today()
    return mockState.projects.map((project) => {
      const tasks = mockState.projectTasks.filter((task) => task.project_id === project.id)
      const openTasks = tasks.filter((task) => task.status !== 'done').length
      const doneToday = tasks.filter(
        (task) => task.status === 'done' && task.updated_at.startsWith(todayPrefix),
      ).length
      return {
        ...project,
        open_tasks: openTasks,
        done_today: doneToday,
      }
    })
  },

  async projectsListDetails(): Promise<ProjectDetails[]> {
    if (hasTauriRuntime()) {
      return tauriInvoke('projects_list_details')
    }

    const projects = await this.projectsGetState()
    return projects.map((project) => {
      const notes: ProjectNoteBlock[] = mockState.notes
        .filter((note) => mockState.noteProjectByPath[note.path] === project.id)
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .map((note) => ({
          id: note.id,
          path: note.path,
          title: note.title,
          updated_at: note.updated_at,
          preview_md: extractPreview(note.body_md),
        }))
      const tasks: ProjectTaskView[] = mockState.projectTasks
        .filter((task) => task.project_id === project.id)
        .sort((left, right) => {
          const statusOrder = (status: string) =>
            status === 'todo' ? 0 : status === 'in_progress' ? 1 : status === 'done' ? 2 : 3
          const byStatus = statusOrder(left.status) - statusOrder(right.status)
          if (byStatus !== 0) return byStatus
          const leftDue = left.due_at ?? '9999-12-31T23:59:59Z'
          const rightDue = right.due_at ?? '9999-12-31T23:59:59Z'
          const byDue = leftDue.localeCompare(rightDue)
          if (byDue !== 0) return byDue
          return right.updated_at.localeCompare(left.updated_at)
        })
        .map(({ id, title, status, energy, due_at, updated_at }) => ({
          id,
          title,
          status,
          energy,
          due_at,
          updated_at,
        }))

      return {
        project,
        notes,
        tasks,
      }
    })
  },

  async projectsAssignNotes(
    projectId: string,
    notePaths: string[],
  ): Promise<ProjectAssignNotesReport> {
    if (hasTauriRuntime()) {
      return tauriInvoke('projects_assign_notes', { projectId, notePaths })
    }

    const normalizedProjectId = projectId.trim()
    if (!mockState.projects.some((project) => project.id === normalizedProjectId || project.slug === normalizedProjectId)) {
      throw new Error(`Проект не найден: ${normalizedProjectId}`)
    }
    const resolvedProjectId = mockState.projects.find((project) =>
      project.id === normalizedProjectId || project.slug === normalizedProjectId,
    )?.id ?? normalizedProjectId

    const uniquePaths = [...new Set(notePaths.map((path) => path.trim().replace(/\\/g, '/')).filter(Boolean))]
    let updated = 0
    let skipped = 0
    for (const path of uniquePaths) {
      const note = mockState.notes.find((item) => item.path === path)
      if (!note) {
        skipped += 1
        continue
      }
      mockState.noteProjectByPath[path] = resolvedProjectId
      note.updated_at = now()
      updated += 1
    }
    return { updated, skipped }
  },

  async projectsTaskCreate(input: {
    projectId: string
    title: string
    status?: string
    energy?: string
    dueAt?: string | null
  }): Promise<ProjectTaskView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('projects_task_create', {
        projectId: input.projectId,
        title: input.title,
        status: input.status,
        energy: input.energy,
        dueAt: input.dueAt,
      })
    }

    const normalizedTitle = input.title.trim()
    if (!normalizedTitle) {
      throw new Error('Заголовок задачи не может быть пустым')
    }
    const project = mockState.projects.find((item) =>
      item.id === input.projectId || item.slug === input.projectId,
    )
    if (!project) {
      throw new Error(`Проект не найден: ${input.projectId}`)
    }

    const task = {
      id: crypto.randomUUID(),
      project_id: project.id,
      title: normalizedTitle,
      status: normalizeProjectTaskStatus(input.status),
      energy: normalizeProjectTaskEnergy(input.energy),
      due_at: input.dueAt?.trim() || undefined,
      created_at: now(),
      updated_at: now(),
    }
    mockState.projectTasks.unshift(task)
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      energy: task.energy,
      due_at: task.due_at,
      updated_at: task.updated_at,
    }
  },

  async projectsTaskUpdate(
    taskId: string,
    input: {
      title?: string
      status?: string
      energy?: string
      dueAt?: string | null
    },
  ): Promise<ProjectTaskView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('projects_task_update', {
        taskId,
        title: input.title,
        status: input.status,
        energy: input.energy,
        dueAt: input.dueAt,
      })
    }

    const idx = mockState.projectTasks.findIndex((task) => task.id === taskId)
    if (idx < 0) {
      throw new Error(`Задача не найдена: ${taskId}`)
    }

    const current = mockState.projectTasks[idx]
    const nextTitle = input.title !== undefined ? input.title.trim() : current.title
    if (!nextTitle) {
      throw new Error('Заголовок задачи не может быть пустым')
    }

    const hasDueAt = Object.prototype.hasOwnProperty.call(input, 'dueAt')
    const nextDueAt = hasDueAt
      ? (input.dueAt?.trim() || undefined)
      : current.due_at

    const updated = {
      ...current,
      title: nextTitle,
      status: input.status ? normalizeProjectTaskStatus(input.status) : current.status,
      energy: input.energy ? normalizeProjectTaskEnergy(input.energy) : current.energy,
      due_at: nextDueAt,
      updated_at: now(),
    }
    mockState.projectTasks[idx] = updated

    return {
      id: updated.id,
      title: updated.title,
      status: updated.status,
      energy: updated.energy,
      due_at: updated.due_at,
      updated_at: updated.updated_at,
    }
  },

  async projectsTaskDelete(taskId: string): Promise<void> {
    if (hasTauriRuntime()) {
      return tauriInvoke('projects_task_delete', { taskId })
    }

    const idx = mockState.projectTasks.findIndex((task) => task.id === taskId)
    if (idx < 0) {
      throw new Error(`Задача не найдена: ${taskId}`)
    }
    mockState.projectTasks.splice(idx, 1)
  },

  async telegramSetConfig(botToken: string, username: string): Promise<TelegramStatus> {
    if (hasTauriRuntime()) {
      return tauriInvoke('telegram_set_config', { botToken, username })
    }

    mockState.telegram.botToken = botToken.trim()
    mockState.telegram.username = username.trim().replace(/^@+/, '').toLowerCase()
    mockState.telegram.verified = false
    mockState.telegram.running = false
    mockState.telegram.pendingCode = ''
    mockState.telegram.pendingExpiresAt = ''
    mockState.telegram.chatId = ''
    mockState.telegram.lastError = ''
    return {
      configured: Boolean(mockState.telegram.botToken && mockState.telegram.username),
      verified: mockState.telegram.verified,
      running: mockState.telegram.running,
      username: mockState.telegram.username || undefined,
      chat_id: mockState.telegram.chatId || undefined,
      last_poll_at: mockState.telegram.lastPollAt || undefined,
      last_error: undefined,
    }
  },

  async telegramBeginVerification(): Promise<TelegramVerificationCode> {
    if (hasTauriRuntime()) {
      return tauriInvoke('telegram_begin_verification')
    }
    if (!mockState.telegram.botToken || !mockState.telegram.username) {
      throw new Error('Telegram не настроен')
    }

    const code = `SNORG-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    mockState.telegram.pendingCode = code
    mockState.telegram.pendingExpiresAt = expiresAt
    return { code, expires_at: expiresAt }
  },

  async telegramPollOnce(): Promise<TelegramPollReport> {
    if (hasTauriRuntime()) {
      return tauriInvoke('telegram_poll_once')
    }

    mockState.telegram.lastPollAt = now()
    if (!mockState.telegram.botToken || !mockState.telegram.username) {
      mockState.telegram.lastError = 'Telegram не настроен'
      throw new Error(mockState.telegram.lastError)
    }

    if (!mockState.telegram.verified && mockState.telegram.pendingCode) {
      mockState.telegram.verified = true
      mockState.telegram.chatId = 'mock_private_chat'
      mockState.telegram.pendingCode = ''
      mockState.telegram.pendingExpiresAt = ''
      mockState.telegram.lastError = ''
      return { fetched: 1, accepted: 1, rejected: 0, verified_now: true }
    }

    return { fetched: 0, accepted: 0, rejected: 0, verified_now: false }
  },

  async telegramListenerStart(): Promise<TelegramStatus> {
    if (hasTauriRuntime()) {
      return tauriInvoke('telegram_listener_start')
    }
    if (!mockState.telegram.verified) {
      throw new Error('Telegram не верифицирован')
    }
    mockState.telegram.running = true
    return {
      configured: Boolean(mockState.telegram.botToken && mockState.telegram.username),
      verified: mockState.telegram.verified,
      running: mockState.telegram.running,
      username: mockState.telegram.username || undefined,
      chat_id: mockState.telegram.chatId || undefined,
      last_poll_at: mockState.telegram.lastPollAt || undefined,
      last_error: mockState.telegram.lastError || undefined,
    }
  },

  async telegramListenerStop(): Promise<TelegramStatus> {
    if (hasTauriRuntime()) {
      return tauriInvoke('telegram_listener_stop')
    }
    mockState.telegram.running = false
    return {
      configured: Boolean(mockState.telegram.botToken && mockState.telegram.username),
      verified: mockState.telegram.verified,
      running: mockState.telegram.running,
      username: mockState.telegram.username || undefined,
      chat_id: mockState.telegram.chatId || undefined,
      last_poll_at: mockState.telegram.lastPollAt || undefined,
      last_error: mockState.telegram.lastError || undefined,
    }
  },

  async telegramStatus(): Promise<TelegramStatus> {
    if (hasTauriRuntime()) {
      return tauriInvoke('telegram_status')
    }
    return {
      configured: Boolean(mockState.telegram.botToken && mockState.telegram.username),
      verified: mockState.telegram.verified,
      running: mockState.telegram.running,
      username: mockState.telegram.username || undefined,
      chat_id: mockState.telegram.chatId || undefined,
      last_poll_at: mockState.telegram.lastPollAt || undefined,
      last_error: mockState.telegram.lastError || undefined,
    }
  },
}

