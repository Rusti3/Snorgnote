import { describe, expect, it } from 'vitest'

import {
  buildPausedRuntimeFromBackend,
  createStorageEnvelope,
  normalizeStoredRuntime,
  shouldUseBackendSession,
} from './pomodoro-storage'

describe('pomodoro-storage', () => {
  it('normalizes invalid stored runtime to null', () => {
    expect(normalizeStoredRuntime(undefined)).toBeNull()
    expect(normalizeStoredRuntime({})).toBeNull()
    expect(
      normalizeStoredRuntime({
        phase: 'focus',
        cycle_index: 0,
        remaining_sec: -5,
        is_running: true,
      }),
    ).toBeNull()
  })

  it('forces restored runtime into paused state after app restart', () => {
    const envelope = createStorageEnvelope({
      phase: 'short_break',
      cycle_index: 1,
      remaining_sec: 95,
      is_running: true,
    })

    const restored = normalizeStoredRuntime(envelope)
    expect(restored).toEqual({
      phase: 'short_break',
      cycle_index: 1,
      remaining_sec: 95,
      is_running: false,
    })
  })

  it('prefers backend session when local and backend state diverge', () => {
    expect(
      shouldUseBackendSession(
        {
          phase: 'long_break',
          cycle_index: 2,
          remaining_sec: 100,
          is_running: false,
        },
        {
          id: 'session-1',
          started_at: '2026-02-24T10:00:00Z',
          status: 'running',
          paused_total_sec: 0,
          project_id: 'project_general',
          task_id: undefined,
        },
      ),
    ).toBe(true)
  })

  it('builds paused focus runtime from backend elapsed seconds', () => {
    const runtime = buildPausedRuntimeFromBackend(
      {
        id: 'session-1',
        started_at: '2026-02-24T10:00:00Z',
        status: 'running',
        elapsed_sec: 600,
        paused_total_sec: 0,
        project_id: 'project_general',
        task_id: undefined,
      },
      25 * 60,
    )
    expect(runtime.phase).toBe('focus')
    expect(runtime.is_running).toBe(false)
    expect(runtime.remaining_sec).toBe(15 * 60)
  })
})

