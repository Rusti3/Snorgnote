import type { FocusSessionView } from '../../types/api'
import type { PomodoroRuntime } from './pomodoro-engine'

export interface PomodoroStorageEnvelope {
  version: 1
  saved_at: string
  runtime: PomodoroRuntime
}

function isPhase(value: unknown): value is PomodoroRuntime['phase'] {
  return value === 'focus' || value === 'short_break' || value === 'long_break'
}

function toRuntime(candidate: unknown): PomodoroRuntime | null {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }
  const runtime = candidate as Record<string, unknown>
  if (!isPhase(runtime.phase)) {
    return null
  }
  if (
    typeof runtime.cycle_index !== 'number'
    || !Number.isInteger(runtime.cycle_index)
    || runtime.cycle_index < 0
  ) {
    return null
  }
  if (
    typeof runtime.remaining_sec !== 'number'
    || !Number.isFinite(runtime.remaining_sec)
    || runtime.remaining_sec < 0
  ) {
    return null
  }
  if (typeof runtime.is_running !== 'boolean') {
    return null
  }
  return {
    phase: runtime.phase,
    cycle_index: runtime.cycle_index,
    remaining_sec: runtime.remaining_sec,
    is_running: runtime.is_running,
  }
}

export function createStorageEnvelope(runtime: PomodoroRuntime): PomodoroStorageEnvelope {
  return {
    version: 1,
    saved_at: new Date().toISOString(),
    runtime,
  }
}

export function normalizeStoredRuntime(raw: unknown): PomodoroRuntime | null {
  const envelope = raw as { runtime?: unknown } | null
  const candidate = envelope && typeof envelope === 'object' && 'runtime' in envelope
    ? envelope.runtime
    : raw
  const runtime = toRuntime(candidate)
  if (!runtime) {
    return null
  }
  return {
    ...runtime,
    // Restart policy: always resume in paused state.
    is_running: false,
  }
}

export function shouldUseBackendSession(
  localRuntime: PomodoroRuntime | null,
  backendSession: FocusSessionView | undefined,
): boolean {
  if (!backendSession) {
    return false
  }
  if (!localRuntime) {
    return true
  }
  if (localRuntime.phase !== 'focus') {
    return true
  }
  return backendSession.status === 'running' || backendSession.status === 'paused'
}

export function buildPausedRuntimeFromBackend(
  session: FocusSessionView,
  focusPhaseDurationSec: number,
): PomodoroRuntime {
  const elapsed = typeof session.elapsed_sec === 'number'
    ? Math.max(0, Math.floor(session.elapsed_sec))
    : 0
  return {
    phase: 'focus',
    cycle_index: 0,
    remaining_sec: Math.max(0, focusPhaseDurationSec - elapsed),
    is_running: false,
  }
}

