export const INBOX_UPDATED_EVENT = 'snorgnote://inbox-updated'

export type InboxUpdatedPayload = {
  item_id?: string
  source?: string
}

export type ListenInboxUpdatesFn = (
  eventName: string,
  handler: (event: { payload: InboxUpdatedPayload }) => void,
) => Promise<() => void>

const noop = () => {}

const hasTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export async function subscribeInboxUpdates(
  onUpdate: () => void,
  listenImpl?: ListenInboxUpdatesFn,
): Promise<() => void> {
  if (!hasTauriRuntime()) {
    return noop
  }

  const listen = listenImpl
    ?? (await import('@tauri-apps/api/event')).listen as ListenInboxUpdatesFn

  return listen(INBOX_UPDATED_EVENT, () => {
    onUpdate()
  })
}
