import { describe, expect, it, vi } from 'vitest'

async function loadApiModule() {
  vi.resetModules()
  const mod = await import('./api')
  return mod.api
}

describe('api focus mock contract', () => {
  it('returns inactive state when no session is running', async () => {
    const api = await loadApiModule()
    const active = await api.focusActive()
    expect(active.active).toBe(false)
    expect(active.session).toBeUndefined()
  })

  it('supports pause/resume lifecycle in mock mode', async () => {
    const api = await loadApiModule()
    const started = await api.focusStart('project_general', undefined)
    expect(started.id).toBeTruthy()
    expect(started.status).toBe('running')

    const paused = await api.focusPause()
    expect(paused.status).toBe('paused')
    expect(paused.paused_at).toBeTruthy()
    expect(paused.ended_at).toBeUndefined()

    const resumed = await api.focusResume()
    expect(resumed.status).toBe('running')
    expect(resumed.paused_at).toBeUndefined()

    const stopped = await api.focusStop()
    expect(stopped.status).toBe('stopped')
    expect(stopped.duration_sec).toBeTypeOf('number')

    const active = await api.focusActive()
    expect(active.active).toBe(false)
  })

  it('rejects resume when session is not paused', async () => {
    const api = await loadApiModule()
    await api.focusStart('project_general', undefined)
    await expect(api.focusResume()).rejects.toThrow()
    await api.focusStop()
  })
})

