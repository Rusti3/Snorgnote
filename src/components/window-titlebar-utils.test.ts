import { describe, expect, it } from 'vitest'

import { isWindowControlTarget, shouldStartWindowDrag } from './window-titlebar-utils'

describe('window-titlebar-utils', () => {
  it('starts drag only for primary mouse button', () => {
    expect(shouldStartWindowDrag(0)).toBe(true)
    expect(shouldStartWindowDrag(1)).toBe(false)
    expect(shouldStartWindowDrag(2)).toBe(false)
  })

  it('detects clicks on window control buttons', () => {
    const controlTarget = {
      closest: (selector: string) =>
        selector === '[data-window-control="true"]' ? {} : null,
    } as unknown as EventTarget

    const nonControlTarget = {
      closest: () => null,
    } as unknown as EventTarget

    expect(isWindowControlTarget(controlTarget)).toBe(true)
    expect(isWindowControlTarget(nonControlTarget)).toBe(false)
    expect(isWindowControlTarget(null)).toBe(false)
    expect(isWindowControlTarget({} as EventTarget)).toBe(false)
  })
})
