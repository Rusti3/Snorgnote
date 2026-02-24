import { describe, expect, it } from 'vitest'

import {
  completeCurrentPhase,
  createInitialRuntime,
  normalizePomodoroConfig,
  resetRuntime,
  skipCurrentPhase,
  type PomodoroRuntime,
} from './pomodoro-engine'

function buildRunningFocusRuntime(config = normalizePomodoroConfig({})): PomodoroRuntime {
  const runtime = createInitialRuntime(config)
  return {
    ...runtime,
    is_running: true,
    remaining_sec: 0,
  }
}

describe('pomodoro-engine', () => {
  it('normalizes config with bounds and integer values', () => {
    expect(
      normalizePomodoroConfig({
        focus_min: 0,
        short_break_min: 999,
        long_break_min: 2.6,
        long_break_every: 1.4,
      }),
    ).toEqual({
      focus_min: 25,
      short_break_min: 60,
      long_break_min: 5,
      long_break_every: 2,
    })
  })

  it('completes focus into short break without auto-start', () => {
    const config = normalizePomodoroConfig({
      focus_min: 25,
      short_break_min: 5,
      long_break_min: 15,
      long_break_every: 4,
    })
    const next = completeCurrentPhase(buildRunningFocusRuntime(config), config)

    expect(next.phase).toBe('short_break')
    expect(next.is_running).toBe(false)
    expect(next.cycle_index).toBe(1)
    expect(next.remaining_sec).toBe(5 * 60)
  })

  it('completes focus into long break every N focus cycles', () => {
    const config = normalizePomodoroConfig({
      focus_min: 30,
      short_break_min: 5,
      long_break_min: 20,
      long_break_every: 4,
    })
    const next = completeCurrentPhase(
      {
        ...buildRunningFocusRuntime(config),
        cycle_index: 3,
      },
      config,
    )

    expect(next.phase).toBe('long_break')
    expect(next.cycle_index).toBe(4)
    expect(next.remaining_sec).toBe(20 * 60)
    expect(next.is_running).toBe(false)
  })

  it('skip uses the same transition rules as completion', () => {
    const config = normalizePomodoroConfig({
      focus_min: 25,
      short_break_min: 5,
      long_break_min: 15,
      long_break_every: 3,
    })
    const skipped = skipCurrentPhase(
      {
        ...createInitialRuntime(config),
        phase: 'focus',
        cycle_index: 2,
        remaining_sec: 11,
        is_running: true,
      },
      config,
    )

    expect(skipped.phase).toBe('long_break')
    expect(skipped.cycle_index).toBe(3)
    expect(skipped.remaining_sec).toBe(15 * 60)
    expect(skipped.is_running).toBe(false)
  })

  it('reset always returns initial idle focus runtime', () => {
    const config = normalizePomodoroConfig({
      focus_min: 42,
      short_break_min: 7,
      long_break_min: 21,
      long_break_every: 5,
    })
    const reset = resetRuntime(
      {
        phase: 'long_break',
        cycle_index: 4,
        remaining_sec: 3,
        is_running: true,
      },
      config,
    )

    expect(reset).toEqual({
      phase: 'focus',
      cycle_index: 0,
      remaining_sec: 42 * 60,
      is_running: false,
    })
  })
})

