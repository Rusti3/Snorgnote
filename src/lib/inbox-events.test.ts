import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  INBOX_UPDATED_EVENT,
  subscribeInboxUpdates,
  type InboxUpdatedPayload,
  type ListenInboxUpdatesFn,
} from './inbox-events'

describe('inbox-events', () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window
    vi.restoreAllMocks()
  })

  it('returns noop unsubscribe when tauri runtime is not available', async () => {
    const onUpdate = vi.fn()
    const listen = vi.fn(async () => () => {}) as unknown as ListenInboxUpdatesFn

    const unsubscribe = await subscribeInboxUpdates(onUpdate, listen)
    unsubscribe()

    expect(listen).not.toHaveBeenCalled()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('subscribes to inbox update event and forwards callbacks', async () => {
    ;(globalThis as { window?: { __TAURI_INTERNALS__?: unknown } }).window = { __TAURI_INTERNALS__: {} }

    const onUpdate = vi.fn()
    const unlisten = vi.fn()
    let handler: ((event: { payload: InboxUpdatedPayload }) => void) | undefined
    const listen = vi.fn(async (eventName, callback) => {
      handler = callback
      expect(eventName).toBe(INBOX_UPDATED_EVENT)
      return unlisten
    }) as unknown as ListenInboxUpdatesFn

    const unsubscribe = await subscribeInboxUpdates(onUpdate, listen)
    expect(listen).toHaveBeenCalledOnce()

    if (!handler) {
      throw new Error('event handler was not registered')
    }
    handler({ payload: { source: 'browser', item_id: 'id-1' } })
    expect(onUpdate).toHaveBeenCalledOnce()

    unsubscribe()
    expect(unlisten).toHaveBeenCalledOnce()
  })
})
