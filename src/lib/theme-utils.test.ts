import { describe, expect, it } from 'vitest'

import {
  buildWindowTitle,
  buildCustomThemeVars,
  DEFAULT_CUSTOM_PRIMARY,
  DEFAULT_CUSTOM_SECONDARY,
  normalizePaletteColor,
  normalizeThemeMode,
  PRIMARY_COLOR_PALETTE,
  SECONDARY_COLOR_PALETTE,
  resolveThemeMode,
  themeModeLabel,
} from './theme-utils'
import type { Locale } from './locale'

describe('theme-utils', () => {
  it('normalizes unknown mode to system', () => {
    expect(normalizeThemeMode('light')).toBe('light')
    expect(normalizeThemeMode('dark')).toBe('dark')
    expect(normalizeThemeMode('system')).toBe('system')
    expect(normalizeThemeMode('custom')).toBe('custom')
    expect(normalizeThemeMode('invalid-mode')).toBe('system')
  })

  it('resolves system mode by prefers dark flag', () => {
    expect(resolveThemeMode('light', true)).toBe('light')
    expect(resolveThemeMode('dark', false)).toBe('dark')
    expect(resolveThemeMode('system', true)).toBe('dark')
    expect(resolveThemeMode('system', false)).toBe('light')
    expect(resolveThemeMode('custom', true)).toBe('light')
  })

  it('returns localized labels for theme mode', () => {
    expect(themeModeLabel('system', 'ru')).toBe('Системная')
    expect(themeModeLabel('light', 'ru')).toBe('Светлая')
    expect(themeModeLabel('dark', 'ru')).toBe('Тёмная')
    expect(themeModeLabel('custom', 'ru')).toBe('Кастомная')
    expect(themeModeLabel('system', 'en')).toBe('System')
    expect(themeModeLabel('light', 'en')).toBe('Light')
    expect(themeModeLabel('dark', 'en')).toBe('Dark')
    expect(themeModeLabel('custom', 'en')).toBe('Custom')
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

  it('normalizes custom palette values to known options', () => {
    expect(
      normalizePaletteColor(
        PRIMARY_COLOR_PALETTE[1],
        PRIMARY_COLOR_PALETTE,
        DEFAULT_CUSTOM_PRIMARY,
      ),
    ).toBe(PRIMARY_COLOR_PALETTE[1])

    expect(
      normalizePaletteColor(
        '#invalid',
        PRIMARY_COLOR_PALETTE,
        DEFAULT_CUSTOM_PRIMARY,
      ),
    ).toBe(DEFAULT_CUSTOM_PRIMARY)

    expect(
      normalizePaletteColor(
        SECONDARY_COLOR_PALETTE[2],
        SECONDARY_COLOR_PALETTE,
        DEFAULT_CUSTOM_SECONDARY,
      ),
    ).toBe(SECONDARY_COLOR_PALETTE[2])
  })

  it('builds css vars for custom theme', () => {
    const vars = buildCustomThemeVars('#2f6f44', '#f4e8cb')

    expect(vars['--primary']).toBe('#2f6f44')
    expect(vars['--primary-foreground']).toBe('#ffffff')
    expect(vars['--surface-gradient']).toContain('linear-gradient')
    expect(vars['--bg-radial-1']).toContain('rgba(')
    expect(vars['--bg-radial-2']).toContain('rgba(')
  })
})
