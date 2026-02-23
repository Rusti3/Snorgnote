import type { Locale } from './locale'

export type ThemeMode = 'system' | 'light' | 'dark' | 'custom'
export type ResolvedTheme = 'light' | 'dark'

export const PRIMARY_COLOR_PALETTE = [
  '#2f6f44',
  '#1f6aa5',
  '#8a3fb3',
  '#c5572f',
  '#0f8b8d',
  '#b23a48',
] as const

export const SECONDARY_COLOR_PALETTE = [
  '#f4e8cb',
  '#b9d7f7',
  '#ffd5ec',
  '#d6f5c7',
  '#ffe5b4',
  '#d0d4e8',
] as const

export const DEFAULT_CUSTOM_PRIMARY = PRIMARY_COLOR_PALETTE[0]
export const DEFAULT_CUSTOM_SECONDARY = SECONDARY_COLOR_PALETTE[0]

export function normalizeThemeMode(raw: string | null | undefined): ThemeMode {
  if (raw === 'light' || raw === 'dark' || raw === 'system' || raw === 'custom') {
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
  if (mode === 'custom') return 'light'
  return prefersDark ? 'dark' : 'light'
}

export function themeModeLabel(mode: ThemeMode, locale: Locale): string {
  if (locale === 'ru') {
    if (mode === 'light') return 'Светлая'
    if (mode === 'dark') return 'Тёмная'
    if (mode === 'custom') return 'Кастомная'
    return 'Системная'
  }
  if (mode === 'light') return 'Light'
  if (mode === 'dark') return 'Dark'
  if (mode === 'custom') return 'Custom'
  return 'System'
}

export function buildWindowTitle(
  appName: string,
  mode: ThemeMode,
  locale: Locale,
): string {
  return `${appName} · ${themeModeLabel(mode, locale)}`
}

export function normalizePaletteColor(
  raw: string | null | undefined,
  palette: readonly string[],
  fallback: string,
): string {
  if (!raw) return fallback
  const normalized = raw.trim().toLowerCase()
  const found = palette.find((color) => color.toLowerCase() === normalized)
  return found ?? fallback
}

export function buildCustomThemeVars(
  primary: string,
  secondary: string,
): Record<string, string> {
  const safePrimary = isHexColor(primary) ? primary : DEFAULT_CUSTOM_PRIMARY
  const safeSecondary = isHexColor(secondary) ? secondary : DEFAULT_CUSTOM_SECONDARY
  return {
    '--primary': safePrimary,
    '--primary-foreground': readableOnColor(safePrimary),
    '--surface-gradient': `linear-gradient(135deg, ${rgba(safePrimary, 0.24)} 0%, ${rgba(safeSecondary, 0.24)} 100%)`,
    '--bg-radial-1': rgba(safePrimary, 0.24),
    '--bg-radial-2': rgba(safeSecondary, 0.2),
  }
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function rgb(hexColor: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hexColor)
  if (!match) return [47, 111, 68]
  const full = match[1]
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

function rgba(hexColor: string, alpha: number): string {
  const [r, g, b] = rgb(hexColor)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function readableOnColor(hexColor: string): string {
  const [r, g, b] = rgb(hexColor)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#102218' : '#ffffff'
}
