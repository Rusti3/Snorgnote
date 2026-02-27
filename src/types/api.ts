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
  paused_at?: string
  paused_total_sec?: number
  duration_sec?: number
  status?: 'running' | 'paused' | 'stopped'
  elapsed_sec?: number
}

export interface FocusActiveState {
  active: boolean
  session?: FocusSessionView
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

export interface FocusHistoryItem {
  id: string
  project_id?: string
  task_id?: string
  started_at: string
  ended_at?: string
  paused_total_sec: number
  duration_sec?: number
}

export interface FocusHistoryPage {
  items: FocusHistoryItem[]
  total: number
  limit: number
  offset: number
}

export type FlashcardStatus = 'active' | 'suspended' | 'archived'
export type FlashcardGrade = 'again' | 'hard' | 'good' | 'easy'

export interface FlashcardView {
  id: string
  front_md: string
  back_md: string
  source_note_id?: string
  source_note_path?: string
  vault_path: string
  status: FlashcardStatus
  is_manual: boolean
  due_at: string
  last_reviewed_at?: string
  interval_days: number
  ease_factor: number
  reps: number
  lapses: number
  created_at: string
  updated_at: string
}

export interface FlashcardPage {
  items: FlashcardView[]
  total: number
  limit: number
  offset: number
}

export interface FlashcardsCreateFromNotesReport {
  created: number
  skipped_existing: number
  items: FlashcardView[]
}

export interface FlashcardReviewResult {
  grade: FlashcardGrade
  card: FlashcardView
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

export interface ProjectNoteBlock {
  id: string
  path: string
  title: string
  updated_at: string
  preview_md: string
}

export interface ProjectTaskView {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done' | string
  energy: 'low' | 'medium' | 'high' | string
  due_at?: string
  updated_at: string
}

export interface ProjectDetails {
  project: ProjectState
  notes_total: number
  tasks_total: number
  notes_limit: number
  notes_offset: number
  tasks_limit: number
  tasks_offset: number
  notes: ProjectNoteBlock[]
  tasks: ProjectTaskView[]
}

export interface ProjectAssignNotesReport {
  updated: number
  skipped: number
}

export type HabitFrequencyType = 'daily' | 'weekdays' | 'custom_weekdays' | 'every_n_days'

export interface HabitFrequency {
  type: HabitFrequencyType
  weekdays?: number[]
  interval_days?: number
}

export interface HabitView {
  id: string
  slug: string
  title: string
  description: string
  frequency: HabitFrequency
  project_id?: string
  archived: boolean
  created_at: string
  updated_at: string
}

export interface HabitLogView {
  id: string
  habit_id: string
  log_date: string
  done: boolean
  created_at: string
  updated_at: string
}

export interface HabitTodayItem {
  habit: HabitView
  is_due_today: boolean
  completed_today: boolean
  current_streak: number
}

export interface HabitTodayPage {
  date: string
  total: number
  items: HabitTodayItem[]
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
