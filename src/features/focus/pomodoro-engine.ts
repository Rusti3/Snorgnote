export type PomodoroPhase = 'focus' | 'short_break' | 'long_break'

export interface PomodoroConfig {
  focus_min: number
  short_break_min: number
  long_break_min: number
  long_break_every: number
}

export interface PomodoroRuntime {
  phase: PomodoroPhase
  cycle_index: number
  remaining_sec: number
  is_running: boolean
}

const DEFAULT_CONFIG: PomodoroConfig = {
  focus_min: 25,
  short_break_min: 5,
  long_break_min: 15,
  long_break_every: 4,
}

function normalizeNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback
  }
  return Math.round(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizePomodoroConfig(
  input: Partial<PomodoroConfig> | null | undefined,
): PomodoroConfig {
  const focusRaw = normalizeNumber(input?.focus_min, DEFAULT_CONFIG.focus_min)
  const shortBreakRaw = normalizeNumber(input?.short_break_min, DEFAULT_CONFIG.short_break_min)
  const longBreakRaw = normalizeNumber(input?.long_break_min, DEFAULT_CONFIG.long_break_min)
  const longBreakEveryRaw = normalizeNumber(
    input?.long_break_every,
    DEFAULT_CONFIG.long_break_every,
  )

  return {
    focus_min: focusRaw <= 0 ? DEFAULT_CONFIG.focus_min : clamp(focusRaw, 5, 180),
    short_break_min: shortBreakRaw <= 0 ? DEFAULT_CONFIG.short_break_min : clamp(shortBreakRaw, 1, 60),
    long_break_min: longBreakRaw <= 0 ? DEFAULT_CONFIG.long_break_min : clamp(longBreakRaw, 5, 90),
    long_break_every: longBreakEveryRaw <= 0
      ? DEFAULT_CONFIG.long_break_every
      : clamp(longBreakEveryRaw, 2, 12),
  }
}

export function phaseDurationSec(phase: PomodoroPhase, config: PomodoroConfig): number {
  if (phase === 'focus') {
    return config.focus_min * 60
  }
  if (phase === 'short_break') {
    return config.short_break_min * 60
  }
  return config.long_break_min * 60
}

export function createInitialRuntime(config: PomodoroConfig): PomodoroRuntime {
  return {
    phase: 'focus',
    cycle_index: 0,
    remaining_sec: phaseDurationSec('focus', config),
    is_running: false,
  }
}

export function completeCurrentPhase(
  runtime: PomodoroRuntime,
  config: PomodoroConfig,
): PomodoroRuntime {
  if (runtime.phase === 'focus') {
    const nextCycle = runtime.cycle_index + 1
    const nextPhase: PomodoroPhase = nextCycle % config.long_break_every === 0
      ? 'long_break'
      : 'short_break'
    return {
      phase: nextPhase,
      cycle_index: nextCycle,
      remaining_sec: phaseDurationSec(nextPhase, config),
      is_running: false,
    }
  }

  return {
    phase: 'focus',
    cycle_index: runtime.cycle_index,
    remaining_sec: phaseDurationSec('focus', config),
    is_running: false,
  }
}

export function skipCurrentPhase(
  runtime: PomodoroRuntime,
  config: PomodoroConfig,
): PomodoroRuntime {
  return completeCurrentPhase(
    {
      ...runtime,
      remaining_sec: 0,
      is_running: false,
    },
    config,
  )
}

export function resetRuntime(
  _runtime: PomodoroRuntime,
  config: PomodoroConfig,
): PomodoroRuntime {
  return createInitialRuntime(config)
}

