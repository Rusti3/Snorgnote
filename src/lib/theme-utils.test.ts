import { describe, expect, it } from 'vitest'

import {
  buildWindowTitle,
  normalizeThemeMode,
  resolveThemeMode,
  themeModeLabel,
} from './theme-utils'
import type { Locale } from './locale'

describe('theme-utils', () => {
  it('normalizes unknown mode to system', () => {
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
    expect(normalizeThemeMode('system')).toBe('system')
    expect(normalizeThemeMode('invalid-mode')).toBe('system')
  })

  it('resolves system mode by prefers dark flag', () => {
    expect(resolveThemeMode('light', true)).toBe('light')
    expect(resolveThemeMode('dark', false)).toBe('dark')
    expect(resolveThemeMode('system', true)).toBe('dark')
    expect(resolveThemeMode('system', false)).toBe('light')
  })

  it('returns localized labels for theme mode', () => {
    expect(themeModeLabel('system', 'ru')).toBe('Системная')
    expect(themeModeLabel('light', 'ru')).toBe('Светлая')
    expect(themeModeLabel('dark', 'ru')).toBe('Тёмная')
    expect(themeModeLabel('system', 'en')).toBe('System')
    expect(themeModeLabel('light', 'en')).toBe('Light')
    expect(themeModeLabel('dark', 'en')).toBe('Dark')
  })

  it('builds localized window title', () => {
    const ruLocale: Locale = 'ru'
    const enLocale: Locale = 'en'

    expect(buildWindowTitle('Snorgnote', 'system', ruLocale)).toBe(
      'Snorgnote · Системная',
    )
    expect(buildWindowTitle('Snorgnote', 'dark', enLocale)).toBe(
      'Snorgnote · Dark',
    )
  })
})
