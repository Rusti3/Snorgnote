/* eslint-disable react-refresh/only-export-components */

import { convertFileSrc } from '@tauri-apps/api/core'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { api } from './api'
import {
  buildThemeVars,
  DARK_PRIMARY_COLOR_PALETTE,
  DEFAULT_DARK_PRIMARY,
  DEFAULT_DARK_SECONDARY,
  DEFAULT_LIGHT_PRIMARY,
  DEFAULT_LIGHT_SECONDARY,
  LIGHT_PRIMARY_COLOR_PALETTE,
  normalizePaletteColor,
  normalizeThemeMode,
  resolveThemeMode,
  SECONDARY_COLOR_PALETTE,
} from './theme-utils'
import type { ResolvedTheme, ThemeMode } from './theme-utils'

const THEME_MODE_KEY = 'snorgnote.theme_mode'
const LIGHT_PRIMARY_KEY = 'snorgnote.light_primary'
const LIGHT_SECONDARY_KEY = 'snorgnote.light_secondary'
const DARK_PRIMARY_KEY = 'snorgnote.dark_primary'
const DARK_SECONDARY_KEY = 'snorgnote.dark_secondary'
const CUSTOM_ACCENT_KEY = 'snorgnote.custom_accent'
const CUSTOM_BG_URL_KEY = 'snorgnote.custom_bg_url'
const LEGACY_CUSTOM_PRIMARY_KEY = 'snorgnote.custom_primary'
const LEGACY_CUSTOM_SECONDARY_KEY = 'snorgnote.custom_secondary'
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'
const MAX_CUSTOM_BG_FILE_SIZE = 10 * 1024 * 1024

const ALLOWED_BG_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

type ThemeContextValue = {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  setThemeMode: (next: ThemeMode) => void
  lightPrimary: string
  lightSecondary: string
  darkPrimary: string
  darkSecondary: string
  customAccent: string
  customBackgroundUrl: string | null
  setLightPrimary: (next: string) => void
  setLightSecondary: (next: string) => void
  setDarkPrimary: (next: string) => void
  setDarkSecondary: (next: string) => void
  setCustomAccent: (next: string) => void
  setCustomBackgroundUrl: (next: string | null) => void
  setCustomBackgroundFromFile: (file: File) => Promise<void>
  clearCustomBackground: () => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function detectInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const raw = window.localStorage.getItem(THEME_MODE_KEY)
  return normalizeThemeMode(raw)
}

function detectInitialPaletteColor(
  key: string,
  palette: readonly string[],
  fallback: string,
): string {
  if (typeof window === 'undefined') return fallback
  return normalizePaletteColor(window.localStorage.getItem(key), palette, fallback)
}

function detectInitialBackgroundUrl(): string | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(CUSTOM_BG_URL_KEY)
  const normalized = raw?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

function fileExtension(name: string): string {
  const normalized = name.toLowerCase()
  const idx = normalized.lastIndexOf('.')
  if (idx < 0) return ''
  return normalized.slice(idx)
}

export function ThemeProvider(props: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    detectInitialThemeMode(),
  )
  const [lightPrimary, setLightPrimaryState] = useState<string>(() =>
    detectInitialPaletteColor(
      LIGHT_PRIMARY_KEY,
      LIGHT_PRIMARY_COLOR_PALETTE,
      DEFAULT_LIGHT_PRIMARY,
    ),
  )
  const [lightSecondary, setLightSecondaryState] = useState<string>(() =>
    detectInitialPaletteColor(
      LIGHT_SECONDARY_KEY,
      SECONDARY_COLOR_PALETTE,
      DEFAULT_LIGHT_SECONDARY,
    ),
  )
  const [darkPrimary, setDarkPrimaryState] = useState<string>(() =>
    detectInitialPaletteColor(
      DARK_PRIMARY_KEY,
      DARK_PRIMARY_COLOR_PALETTE,
      DEFAULT_DARK_PRIMARY,
    ),
  )
  const [darkSecondary, setDarkSecondaryState] = useState<string>(() =>
    detectInitialPaletteColor(
      DARK_SECONDARY_KEY,
      SECONDARY_COLOR_PALETTE,
      DEFAULT_DARK_SECONDARY,
    ),
  )
  const [customAccent, setCustomAccentState] = useState<string>(() =>
    detectInitialPaletteColor(
      CUSTOM_ACCENT_KEY,
      SECONDARY_COLOR_PALETTE,
      DEFAULT_DARK_SECONDARY,
    ),
  )
  const [customBackgroundUrl, setCustomBackgroundUrlState] = useState<string | null>(() =>
    detectInitialBackgroundUrl(),
  )
  const [prefersDark, setPrefersDark] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia(DARK_MEDIA_QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const media = window.matchMedia(DARK_MEDIA_QUERY)
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    setPrefersDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(LEGACY_CUSTOM_PRIMARY_KEY)
    window.localStorage.removeItem(LEGACY_CUSTOM_SECONDARY_KEY)
  }, [])

  const resolvedTheme = useMemo<ResolvedTheme>(
    () => resolveThemeMode(themeMode, prefersDark),
    [prefersDark, themeMode],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(THEME_MODE_KEY, themeMode)
  }, [themeMode])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      LIGHT_PRIMARY_KEY,
      normalizePaletteColor(
        lightPrimary,
        LIGHT_PRIMARY_COLOR_PALETTE,
        DEFAULT_LIGHT_PRIMARY,
      ),
    )
  }, [lightPrimary])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      LIGHT_SECONDARY_KEY,
      normalizePaletteColor(
        lightSecondary,
        SECONDARY_COLOR_PALETTE,
        DEFAULT_LIGHT_SECONDARY,
      ),
    )
  }, [lightSecondary])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      DARK_PRIMARY_KEY,
      normalizePaletteColor(
        darkPrimary,
        DARK_PRIMARY_COLOR_PALETTE,
        DEFAULT_DARK_PRIMARY,
      ),
    )
  }, [darkPrimary])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      DARK_SECONDARY_KEY,
      normalizePaletteColor(
        darkSecondary,
        SECONDARY_COLOR_PALETTE,
        DEFAULT_DARK_SECONDARY,
      ),
    )
  }, [darkSecondary])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      CUSTOM_ACCENT_KEY,
      normalizePaletteColor(
        customAccent,
        SECONDARY_COLOR_PALETTE,
        DEFAULT_DARK_SECONDARY,
      ),
    )
  }, [customAccent])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!customBackgroundUrl) {
      window.localStorage.removeItem(CUSTOM_BG_URL_KEY)
      return
    }
    window.localStorage.setItem(CUSTOM_BG_URL_KEY, customBackgroundUrl)
  }, [customBackgroundUrl])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolvedTheme)
    root.style.colorScheme = resolvedTheme === 'light' ? 'light' : 'dark'

    const activePrimary =
      resolvedTheme === 'dark'
        ? darkPrimary
        : resolvedTheme === 'custom'
          ? darkPrimary
          : lightPrimary
    const activeSecondary =
      resolvedTheme === 'dark'
        ? darkSecondary
        : resolvedTheme === 'custom'
          ? customAccent
          : lightSecondary

    const vars = buildThemeVars(resolvedTheme, activePrimary, activeSecondary, {
      backgroundImageUrl: resolvedTheme === 'custom' ? customBackgroundUrl : null,
    })
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value)
    }
  }, [
    customAccent,
    customBackgroundUrl,
    darkPrimary,
    darkSecondary,
    lightPrimary,
    lightSecondary,
    resolvedTheme,
  ])

  const setLightPrimary = useCallback((next: string) => {
    setLightPrimaryState(
      normalizePaletteColor(
        next,
        LIGHT_PRIMARY_COLOR_PALETTE,
        DEFAULT_LIGHT_PRIMARY,
      ),
    )
  }, [])

  const setLightSecondary = useCallback((next: string) => {
    setLightSecondaryState(
      normalizePaletteColor(
        next,
        SECONDARY_COLOR_PALETTE,
        DEFAULT_LIGHT_SECONDARY,
      ),
    )
  }, [])

  const setDarkPrimary = useCallback((next: string) => {
    setDarkPrimaryState(
      normalizePaletteColor(next, DARK_PRIMARY_COLOR_PALETTE, DEFAULT_DARK_PRIMARY),
    )
  }, [])

  const setDarkSecondary = useCallback((next: string) => {
    setDarkSecondaryState(
      normalizePaletteColor(next, SECONDARY_COLOR_PALETTE, DEFAULT_DARK_SECONDARY),
    )
  }, [])

  const setCustomAccent = useCallback((next: string) => {
    setCustomAccentState(
      normalizePaletteColor(next, SECONDARY_COLOR_PALETTE, DEFAULT_DARK_SECONDARY),
    )
  }, [])

  const setCustomBackgroundUrl = useCallback((next: string | null) => {
    setCustomBackgroundUrlState((current) => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current)
      }
      return next
    })
  }, [])

  const setCustomBackgroundFromFile = useCallback(async (file: File) => {
    if (!file) {
      throw new Error('No file selected')
    }
    const ext = fileExtension(file.name)
    if (!ALLOWED_BG_EXTENSIONS.has(ext)) {
      throw new Error('Only PNG, JPG, JPEG and WEBP images are supported')
    }
    if (file.size <= 0 || file.size > MAX_CUSTOM_BG_FILE_SIZE) {
      throw new Error('Image file must be between 1 byte and 10 MB')
    }

    let nextUrl: string
    if (api.isTauri()) {
      const bytes = Array.from(new Uint8Array(await file.arrayBuffer()))
      const savedPath = await api.themeSaveBackgroundImage(file.name, bytes)
      nextUrl = convertFileSrc(savedPath)
    } else {
      nextUrl = URL.createObjectURL(file)
    }

    setCustomBackgroundUrlState((current) => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current)
      }
      return nextUrl
    })
  }, [])

  const clearCustomBackground = useCallback(async () => {
    if (api.isTauri()) {
      await api.themeClearBackgroundImage()
    }
    setCustomBackgroundUrlState((current) => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current)
      }
      return null
    })
  }, [])

  useEffect(() => {
    return () => {
      if (customBackgroundUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(customBackgroundUrl)
      }
    }
  }, [customBackgroundUrl])

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      resolvedTheme,
      setThemeMode,
      lightPrimary,
      lightSecondary,
      darkPrimary,
      darkSecondary,
      customAccent,
      customBackgroundUrl,
      setLightPrimary,
      setLightSecondary,
      setDarkPrimary,
      setDarkSecondary,
      setCustomAccent,
      setCustomBackgroundUrl,
      setCustomBackgroundFromFile,
      clearCustomBackground,
    }),
    [
      clearCustomBackground,
      customAccent,
      customBackgroundUrl,
      darkPrimary,
      darkSecondary,
      lightPrimary,
      lightSecondary,
      resolvedTheme,
      setCustomAccent,
      setCustomBackgroundFromFile,
      setCustomBackgroundUrl,
      setDarkPrimary,
      setDarkSecondary,
      setLightPrimary,
      setLightSecondary,
      themeMode,
    ],
  )

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
