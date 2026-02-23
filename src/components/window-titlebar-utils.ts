export function shouldStartWindowDrag(mouseButton: number): boolean {
  return mouseButton === 0
}

export function isWindowControlTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false

  const maybeClosest = target as { closest?: (selector: string) => unknown }
  if (typeof maybeClosest.closest !== 'function') return false

  return Boolean(maybeClosest.closest('[data-window-control="true"]'))
}
