import { describe, expect, it } from 'vitest'

import { shouldStartWindowDrag } from './window-titlebar-utils'

describe('window-titlebar-utils', () => {
  it('starts drag only for primary mouse button', () => {
    expect(shouldStartWindowDrag(0)).toBe(true)
    expect(shouldStartWindowDrag(1)).toBe(false)
    expect(shouldStartWindowDrag(2)).toBe(false)
  })
})
