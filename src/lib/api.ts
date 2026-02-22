import { invoke } from '@tauri-apps/api/core'

import type {
  DailyPlan,
  DashboardOverview,
  FocusSessionView,
  FocusStats,
  InboxItemView,
  JobRunReport,
  NoteDocument,
  NoteSummary,
  ProjectState,
  SkillRecord,
  SkillRunResult,
  SkillValidation,
  TelegramPollReport,
  TelegramStatus,
  TelegramVerificationCode,
  WeeklyPlan,
} from '../types/api'

const hasTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)

const mockState = {
  notes: [] as NoteDocument[],
  inbox: [] as InboxItemView[],
  skills: [
    { id: 'daily_planner', slug: 'daily_planner', version: 1, enabled: true },
    { id: 'spaced_review', slug: 'spaced_review', version: 1, enabled: true },
  ] as SkillRecord[],
  projects: [
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
  ] as ProjectState[],
  focusActive: null as FocusSessionView | null,
  focusHistory: [] as FocusSessionView[],
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
  return invoke<T>(command, args)
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
    throw new Error(`Note not found: ${path}`)
  },

  async vaultSaveNote(path: string, bodyMd: string): Promise<NoteDocument> {
    if (hasTauriRuntime()) {
      return tauriInvoke('vault_save_note', { path, body_md: bodyMd })
    }

    const title = bodyMd
      .split('\n')
      .find((line) => line.trim().startsWith('# '))
      ?.replace(/^#\s+/, '')
      ?.trim()
      || path.replace(/\.md$/i, '').split('/').pop()
      || 'Untitled'

    const doc: NoteDocument = {
      id: crypto.randomUUID(),
      path,
      title,
      body_md: bodyMd,
      frontmatter: {},
      updated_at: now(),
    }
    const idx = mockState.notes.findIndex((note) => note.path === path)
    if (idx >= 0) mockState.notes[idx] = doc
    else mockState.notes.push(doc)
    return doc
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
        content_text: contentText,
        tags,
        project_hint: projectHint,
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

    if (!status) return mockState.inbox
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
      errors: hasJobs ? [] : ['at least one job must be defined'],
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
        'Important: Ship one meaningful artifact',
        'Light: Clean one inbox cluster',
        'Recovery: 20-minute walk',
      ],
      markdown: '# Daily\n\n- [ ] Important task',
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
      highlights: ['Completed tasks: 0', 'Focus minutes: 0'],
      markdown: '# Weekly\n',
    }
  },

  async focusStart(projectId?: string, taskId?: string): Promise<FocusSessionView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('focus_start', { project_id: projectId, task_id: taskId })
    }
    const session: FocusSessionView = {
      id: crypto.randomUUID(),
      project_id: projectId,
      task_id: taskId,
      started_at: now(),
    }
    mockState.focusActive = session
    return session
  },

  async focusStop(): Promise<FocusSessionView> {
    if (hasTauriRuntime()) {
      return tauriInvoke('focus_stop')
    }
    if (!mockState.focusActive) {
      throw new Error('No active focus session')
    }
    const startedAt = new Date(mockState.focusActive.started_at).getTime()
    const durationSec = Math.floor((Date.now() - startedAt) / 1000)
    const ended: FocusSessionView = {
      ...mockState.focusActive,
      ended_at: now(),
      duration_sec: Math.max(0, durationSec),
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
    return mockState.projects
  },

  async telegramSetConfig(botToken: string, username: string): Promise<TelegramStatus> {
    if (hasTauriRuntime()) {
      return tauriInvoke('telegram_set_config', { bot_token: botToken, username })
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
      throw new Error('Telegram is not configured')
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
      mockState.telegram.lastError = 'Telegram is not configured'
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
      throw new Error('Telegram is not verified')
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
