import { describe, expect, it } from 'vitest'

import {
  buildThemeVars,
  buildWindowTitle,
  DEFAULT_DARK_PRIMARY,
  DEFAULT_DARK_SECONDARY,
  DEFAULT_LIGHT_PRIMARY,
  DEFAULT_LIGHT_SECONDARY,
  DARK_PRIMARY_COLOR_PALETTE,
  LIGHT_PRIMARY_COLOR_PALETTE,
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
    expect(normalizeThemeMode('custom')).toBe('system')
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

  it('normalizes palette values to known options', () => {
    expect(
      normalizePaletteColor(
        PRIMARY_COLOR_PALETTE[1],
        PRIMARY_COLOR_PALETTE,
        DEFAULT_LIGHT_PRIMARY,
      ),
    ).toBe(PRIMARY_COLOR_PALETTE[1])

    expect(
      normalizePaletteColor(
        '#invalid',
        PRIMARY_COLOR_PALETTE,
        DEFAULT_LIGHT_PRIMARY,
      ),
    ).toBe(DEFAULT_LIGHT_PRIMARY)

    expect(
      normalizePaletteColor(
        SECONDARY_COLOR_PALETTE[2],
        SECONDARY_COLOR_PALETTE,
        DEFAULT_LIGHT_SECONDARY,
      ),
    ).toBe(SECONDARY_COLOR_PALETTE[2])

    expect(
      normalizePaletteColor('#ffffff', LIGHT_PRIMARY_COLOR_PALETTE, DEFAULT_LIGHT_PRIMARY),
    ).toBe('#ffffff')
    expect(
      normalizePaletteColor('#000000', DARK_PRIMARY_COLOR_PALETTE, DEFAULT_DARK_PRIMARY),
    ).toBe('#000000')
    expect(
      normalizePaletteColor('#ffffff', DARK_PRIMARY_COLOR_PALETTE, DEFAULT_DARK_PRIMARY),
    ).toBe(DEFAULT_DARK_PRIMARY)
    expect(
      normalizePaletteColor('#000000', LIGHT_PRIMARY_COLOR_PALETTE, DEFAULT_LIGHT_PRIMARY),
    ).toBe(DEFAULT_LIGHT_PRIMARY)
  })

  it('builds css vars for light mode', () => {
    const vars = buildThemeVars('light', '#2f6f44', '#f4e8cb')

    // Secondary controls actionable UI colors (buttons, active states)
    expect(vars['--primary']).toBe('#f4e8cb')
    expect(vars['--primary-foreground']).toBe('#102218')

    // Primary controls structural/background colors
    expect(vars['--background']).toMatch(/^#[0-9a-f]{6}$/i)
    expect(vars['--titlebar-bg']).toMatch(/^#[0-9a-f]{6}$/i)
    expect(vars['--card']).toMatch(/^#[0-9a-f]{6}$/i)

    expect(vars['--surface-gradient']).toContain('linear-gradient')
    expect(vars['--bg-radial-1']).toContain('rgba(')
    expect(vars['--bg-radial-2']).toContain('rgba(')
  })

  it('builds css vars for dark mode', () => {
    const vars = buildThemeVars('dark', '#2f6f44', '#d0d4e8')

    // Secondary controls actionable UI colors (buttons, active states)
    expect(vars['--primary']).toBe('#d0d4e8')

    // Dark palette remains dark for the app background/titlebar
    expect(vars['--background']).toMatch(/^#[0-9a-f]{6}$/i)
    expect(vars['--titlebar-bg']).toMatch(/^#[0-9a-f]{6}$/i)
    expect(vars['--background']).not.toBe(vars['--card'])

    const backgroundHex = vars['--background']
    const parsed = Number.parseInt(backgroundHex.replace('#', ''), 16)
    expect(parsed).toBeLessThan(0x444444)
  })

  it('falls back to mode defaults for invalid hex colors', () => {
    const lightVars = buildThemeVars('light', 'oops', 'bad')
    const darkVars = buildThemeVars('dark', 'oops', 'bad')

    expect(lightVars['--primary']).toBe(DEFAULT_LIGHT_SECONDARY)
    expect(darkVars['--primary']).toBe(DEFAULT_DARK_SECONDARY)
    expect(lightVars['--background']).not.toBe(darkVars['--background'])

    const baselineLight = buildThemeVars(
      'light',
      DEFAULT_LIGHT_PRIMARY,
      DEFAULT_LIGHT_SECONDARY,
    )
    const baselineDark = buildThemeVars(
      'dark',
      DEFAULT_DARK_PRIMARY,
      DEFAULT_DARK_SECONDARY,
    )

    expect(lightVars['--background']).toBe(baselineLight['--background'])
    expect(darkVars['--background']).toBe(baselineDark['--background'])
  })
})
