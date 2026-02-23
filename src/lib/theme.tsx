/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

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
const LEGACY_CUSTOM_PRIMARY_KEY = 'snorgnote.custom_primary'
const LEGACY_CUSTOM_SECONDARY_KEY = 'snorgnote.custom_secondary'
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

type ThemeContextValue = {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  setThemeMode: (next: ThemeMode) => void
  lightPrimary: string
  lightSecondary: string
  darkPrimary: string
  darkSecondary: string
  setLightPrimary: (next: string) => void
  setLightSecondary: (next: string) => void
  setDarkPrimary: (next: string) => void
  setDarkSecondary: (next: string) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function detectInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const raw = window.localStorage.getItem(THEME_MODE_KEY)
  if (raw === 'custom') return 'light'
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

    const rawMode = window.localStorage.getItem(THEME_MODE_KEY)
    if (rawMode === 'custom') {
      window.localStorage.setItem(THEME_MODE_KEY, 'light')
    }
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
    const root = document.documentElement
    root.setAttribute('data-theme', resolvedTheme)
    root.style.colorScheme = resolvedTheme

    const activePrimary = resolvedTheme === 'dark' ? darkPrimary : lightPrimary
    const activeSecondary =
      resolvedTheme === 'dark' ? darkSecondary : lightSecondary

    const vars = buildThemeVars(resolvedTheme, activePrimary, activeSecondary)
    for (const [key, value] of Object.entries(vars)) {
      root.style.setProperty(key, value)
    }
  }, [darkPrimary, darkSecondary, lightPrimary, lightSecondary, resolvedTheme])

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

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      resolvedTheme,
      setThemeMode,
      lightPrimary,
      lightSecondary,
      darkPrimary,
      darkSecondary,
      setLightPrimary,
      setLightSecondary,
      setDarkPrimary,
      setDarkSecondary,
    }),
    [
      darkPrimary,
      darkSecondary,
      lightPrimary,
      lightSecondary,
      resolvedTheme,
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
