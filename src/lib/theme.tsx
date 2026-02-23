/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import {
  buildCustomThemeVars,
  DEFAULT_CUSTOM_PRIMARY,
  DEFAULT_CUSTOM_SECONDARY,
  normalizePaletteColor,
  normalizeThemeMode,
  PRIMARY_COLOR_PALETTE,
  resolveThemeMode,
  SECONDARY_COLOR_PALETTE,
} from './theme-utils'
import type { ResolvedTheme, ThemeMode } from './theme-utils'

const THEME_MODE_KEY = 'snorgnote.theme_mode'
const CUSTOM_PRIMARY_KEY = 'snorgnote.custom_primary'
const CUSTOM_SECONDARY_KEY = 'snorgnote.custom_secondary'
const DARK_MEDIA_QUERY = '(prefers-color-scheme: dark)'

type ThemeContextValue = {
  themeMode: ThemeMode
  resolvedTheme: ResolvedTheme
  setThemeMode: (next: ThemeMode) => void
  customPrimary: string
  customSecondary: string
  setCustomPrimary: (next: string) => void
  setCustomSecondary: (next: string) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function detectInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  return normalizeThemeMode(window.localStorage.getItem(THEME_MODE_KEY))
}

function detectInitialCustomPrimary(): string {
  if (typeof window === 'undefined') return DEFAULT_CUSTOM_PRIMARY
  return normalizePaletteColor(
    window.localStorage.getItem(CUSTOM_PRIMARY_KEY),
    PRIMARY_COLOR_PALETTE,
    DEFAULT_CUSTOM_PRIMARY,
  )
}

function detectInitialCustomSecondary(): string {
  if (typeof window === 'undefined') return DEFAULT_CUSTOM_SECONDARY
  return normalizePaletteColor(
    window.localStorage.getItem(CUSTOM_SECONDARY_KEY),
    SECONDARY_COLOR_PALETTE,
    DEFAULT_CUSTOM_SECONDARY,
  )
}

export function ThemeProvider(props: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() =>
    detectInitialThemeMode(),
  )
  const [customPrimary, setCustomPrimaryState] = useState<string>(() =>
    detectInitialCustomPrimary(),
  )
  const [customSecondary, setCustomSecondaryState] = useState<string>(() =>
    detectInitialCustomSecondary(),
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
      CUSTOM_PRIMARY_KEY,
      normalizePaletteColor(
        customPrimary,
        PRIMARY_COLOR_PALETTE,
        DEFAULT_CUSTOM_PRIMARY,
      ),
    )
  }, [customPrimary])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(
      CUSTOM_SECONDARY_KEY,
      normalizePaletteColor(
        customSecondary,
        SECONDARY_COLOR_PALETTE,
        DEFAULT_CUSTOM_SECONDARY,
      ),
    )
  }, [customSecondary])

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolvedTheme)
    root.style.colorScheme = resolvedTheme

    const customVars = buildCustomThemeVars(customPrimary, customSecondary)
    const customKeys = Object.keys(customVars)
    if (themeMode === 'custom') {
      for (const [key, value] of Object.entries(customVars)) {
        root.style.setProperty(key, value)
      }
    } else {
      for (const key of customKeys) {
        root.style.removeProperty(key)
      }
    }
  }, [customPrimary, customSecondary, resolvedTheme, themeMode])

  const setCustomPrimary = useCallback((next: string) => {
    setCustomPrimaryState(
      normalizePaletteColor(next, PRIMARY_COLOR_PALETTE, DEFAULT_CUSTOM_PRIMARY),
    )
  }, [])

  const setCustomSecondary = useCallback((next: string) => {
    setCustomSecondaryState(
      normalizePaletteColor(next, SECONDARY_COLOR_PALETTE, DEFAULT_CUSTOM_SECONDARY),
    )
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeMode,
      resolvedTheme,
      setThemeMode,
      customPrimary,
      customSecondary,
      setCustomPrimary,
      setCustomSecondary,
    }),
    [
      customPrimary,
      customSecondary,
      resolvedTheme,
      setCustomPrimary,
      setCustomSecondary,
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
