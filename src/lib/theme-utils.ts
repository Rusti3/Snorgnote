import type { Locale } from './locale'

export type ThemeMode = 'system' | 'light' | 'dark' | 'custom'
export type ResolvedTheme = 'light' | 'dark' | 'custom'

export const PRIMARY_COLOR_PALETTE = [
  '#2f6f44',
  '#1f6aa5',
  '#8a3fb3',
  '#c5572f',
  '#0f8b8d',
  '#b23a48',
] as const

export const LIGHT_PRIMARY_COLOR_PALETTE = [
  ...PRIMARY_COLOR_PALETTE,
  '#ffffff',
] as const

export const DARK_PRIMARY_COLOR_PALETTE = [
  ...PRIMARY_COLOR_PALETTE,
  '#000000',
] as const

export const SECONDARY_COLOR_PALETTE = [
  '#f4e8cb',
  '#b9d7f7',
  '#ffd5ec',
  '#d6f5c7',
  '#ffe5b4',
  '#d0d4e8',
] as const

export const DEFAULT_LIGHT_PRIMARY = PRIMARY_COLOR_PALETTE[0]
export const DEFAULT_LIGHT_SECONDARY = SECONDARY_COLOR_PALETTE[0]
export const DEFAULT_DARK_PRIMARY = PRIMARY_COLOR_PALETTE[0]
export const DEFAULT_DARK_SECONDARY = SECONDARY_COLOR_PALETTE[0]

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
  if (mode === 'custom') return 'custom'
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

export function buildThemeVars(
  mode: ResolvedTheme,
  primary: string,
  secondary: string,
  options?: {
    backgroundImageUrl?: string | null
  },
): Record<string, string> {
  const safePrimary = isHexColor(primary)
    ? primary
    : mode === 'dark' || mode === 'custom'
      ? DEFAULT_DARK_PRIMARY
      : DEFAULT_LIGHT_PRIMARY
  const safeSecondary = isHexColor(secondary)
    ? secondary
    : mode === 'dark' || mode === 'custom'
      ? DEFAULT_DARK_SECONDARY
      : DEFAULT_LIGHT_SECONDARY

  if (mode === 'custom') {
    return buildCustomThemeVars(
      safePrimary,
      safeSecondary,
      options?.backgroundImageUrl ?? null,
    )
  }

  if (mode === 'dark') {
    return buildDarkThemeVars(safePrimary, safeSecondary)
  }
  return buildLightThemeVars(safePrimary, safeSecondary)
}

function buildLightThemeVars(
  safePrimary: string,
  safeSecondary: string,
): Record<string, string> {
  const background = tint(safePrimary, 0.9)
  const card = tint(safePrimary, 0.95)
  const muted = tint(safePrimary, 0.86)
  const border = tint(safePrimary, 0.72)
  const titlebar = tint(safePrimary, 0.8)
  const foreground = readableOnColor(background)
  const mutedForeground = mixHex(safePrimary, foreground, 0.62)

  return {
    '--background': background,
    '--foreground': foreground,
    '--card': card,
    '--muted': muted,
    '--muted-foreground': mutedForeground,
    '--border': border,
    '--titlebar-bg': titlebar,
    '--primary': safeSecondary,
    '--primary-foreground': readableOnColor(safeSecondary),
    '--surface-gradient': `linear-gradient(135deg, ${rgba(safePrimary, 0.24)} 0%, ${rgba(tint(safePrimary, 0.68), 0.24)} 100%)`,
    '--bg-radial-1': rgba(safePrimary, 0.24),
    '--bg-radial-2': rgba(shade(safePrimary, 0.18), 0.2),
    '--background-image': 'none',
    '--bg-overlay': 'rgba(0, 0, 0, 0)',
    '--custom-surface-alpha': '0.82',
    '--custom-blur': '8px',
    '--field-bg': background,
  }
}

function buildDarkThemeVars(
  safePrimary: string,
  safeSecondary: string,
): Record<string, string> {
  const background = shade(safePrimary, 0.78)
  const card = shade(safePrimary, 0.7)
  const muted = shade(safePrimary, 0.62)
  const border = mixHex(background, '#ffffff', 0.22)
  const titlebar = shade(safePrimary, 0.66)
  const foreground = readableOnColor(background)
  const mutedForeground = mixHex(foreground, background, 0.4)

  return {
    '--background': background,
    '--foreground': foreground,
    '--card': card,
    '--muted': muted,
    '--muted-foreground': mutedForeground,
    '--border': border,
    '--titlebar-bg': titlebar,
    '--primary': safeSecondary,
    '--primary-foreground': readableOnColor(safeSecondary),
    '--surface-gradient': `linear-gradient(135deg, ${rgba(tint(safePrimary, 0.22), 0.22)} 0%, ${rgba(shade(safePrimary, 0.26), 0.28)} 100%)`,
    '--bg-radial-1': rgba(tint(safePrimary, 0.26), 0.24),
    '--bg-radial-2': rgba(shade(safePrimary, 0.08), 0.22),
    '--background-image': 'none',
    '--bg-overlay': 'rgba(0, 0, 0, 0)',
    '--custom-surface-alpha': '0.82',
    '--custom-blur': '8px',
    '--field-bg': background,
  }
}

function buildCustomThemeVars(
  safePrimary: string,
  safeSecondary: string,
  backgroundImageUrl: string | null,
): Record<string, string> {
  const image = backgroundImageUrl?.trim()
  const imageLayer = image
    ? `url("${image.replace(/"/g, '%22')}")`
    : 'none'
  const surfaceAlpha = 0.82

  return {
    '--background': shade(safePrimary, 0.8),
    '--foreground': '#f4f7ff',
    '--card': `rgba(15, 20, 26, ${surfaceAlpha})`,
    '--muted': 'rgba(15, 20, 26, 0.68)',
    '--muted-foreground': 'rgba(228, 235, 248, 0.84)',
    '--border': 'rgba(244, 247, 255, 0.28)',
    '--titlebar-bg': 'rgba(15, 20, 26, 0.84)',
    '--primary': safeSecondary,
    '--primary-foreground': readableOnColor(safeSecondary),
    '--surface-gradient': `linear-gradient(135deg, ${rgba(safePrimary, 0.2)} 0%, ${rgba(shade(safePrimary, 0.22), 0.22)} 100%)`,
    '--bg-radial-1': rgba(tint(safePrimary, 0.3), 0.12),
    '--bg-radial-2': rgba(shade(safePrimary, 0.1), 0.2),
    '--background-image': imageLayer,
    '--bg-overlay': 'rgba(10, 14, 20, 0.36)',
    '--custom-surface-alpha': surfaceAlpha.toFixed(2),
    '--custom-blur': '8px',
    '--field-bg': 'rgba(13, 18, 24, 0.74)',
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

function tint(hexColor: string, amount: number): string {
  return mixHex(hexColor, '#ffffff', amount)
}

function shade(hexColor: string, amount: number): string {
  return mixHex(hexColor, '#000000', amount)
}

function mixHex(hexA: string, hexB: string, amount: number): string {
  const [ar, ag, ab] = rgb(hexA)
  const [br, bg, bb] = rgb(hexB)
  const ratio = clamp01(amount)
  const r = Math.round(ar + (br - ar) * ratio)
  const g = Math.round(ag + (bg - ag) * ratio)
  const b = Math.round(ab + (bb - ab) * ratio)
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, '0')
}

function clamp01(value: number): number {
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function readableOnColor(hexColor: string): string {
  const [r, g, b] = rgb(hexColor)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 150 ? '#102218' : '#ffffff'
}
