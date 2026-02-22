export interface NoteSummary {
  id: string
  path: string
  title: string
  updated_at: string
}

export interface NoteDocument {
  id: string
  path: string
  title: string
  body_md: string
  frontmatter: Record<string, unknown>
  updated_at: string
}

export interface TrashedNoteSummary {
  id: string
  title: string
  original_path: string
  deleted_at: string
}

export interface InboxItemView {
  id: string
  source: string
  content_text: string
  created_at: string
  status: string
  project_hint?: string
  tags: string[]
}

export interface TrashedInboxItem {
  id: string
  source: string
  content_text: string
  created_at: string
  deleted_at: string
  tags: string[]
  previous_status: string
}

export interface JobRunReport {
  processed: number
  succeeded: number
  failed: number
}

export interface SkillRecord {
  id: string
  slug: string
  version: number
  enabled: boolean
}

export interface SkillValidation {
  valid: boolean
  parsed_id?: string
  errors: string[]
  warnings: string[]
}

export interface SkillRunResult {
  skill_id: string
  queued_jobs: number
  report: JobRunReport
}

export interface DailyPlan {
  date: string
  path: string
  suggestions: string[]
  markdown: string
}

export interface WeeklyPlan {
  week: string
  path: string
  highlights: string[]
  markdown: string
}

export interface FocusSessionView {
  id: string
  project_id?: string
  task_id?: string
  started_at: string
  ended_at?: string
  duration_sec?: number
}

export interface ProjectFocusStat {
  project_id: string
  minutes: number
}

export interface FocusStats {
  total_minutes: number
  sessions: number
  by_project: ProjectFocusStat[]
}

export interface DashboardOverview {
  notes: number
  inbox_new: number
  jobs_queued: number
  focus_minutes_today: number
  reviews_due: number
  projects_active: number
}

export interface ProjectState {
  id: string
  slug: string
  name: string
  biome_type: string
  health: number
  xp: number
  level: number
  open_tasks: number
  done_today: number
}

export interface TelegramStatus {
  configured: boolean
  verified: boolean
  running: boolean
  username?: string
  chat_id?: string
  last_poll_at?: string
  last_error?: string
}

export interface TelegramVerificationCode {
  code: string
  expires_at: string
}

export interface TelegramPollReport {
  fetched: number
  accepted: number
  rejected: number
  verified_now: boolean
}
