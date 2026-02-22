import type { Locale } from './locale'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export function normalizeThemeMode(raw: string | null | undefined): ThemeMode {
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw
  }
  return 'system'
}

export function resolveThemeMode(
  mode: ThemeMode,
  prefersDark: boolean,
): ResolvedTheme {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'
  return prefersDark ? 'dark' : 'light'
}

export function themeModeLabel(mode: ThemeMode, locale: Locale): string {
  if (locale === 'ru') {
    if (mode === 'light') return 'Светлая'
    if (mode === 'dark') return 'Тёмная'
    return 'Системная'
  }
  if (mode === 'light') return 'Light'
  if (mode === 'dark') return 'Dark'
  return 'System'
}

export function buildWindowTitle(
  appName: string,
  mode: ThemeMode,
  locale: Locale,
): string {
  return `${appName} · ${themeModeLabel(mode, locale)}`
}
