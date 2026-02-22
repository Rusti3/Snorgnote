/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export type Locale = 'ru' | 'en'

const STORAGE_KEY = 'snorgnote.locale'

type LocaleContextValue = {
  locale: Locale
  setLocale: (next: Locale) => void
  t: (ru: string, en: string) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'ru'

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'ru' || stored === 'en') {
    return stored
  }

  const browserLocale = window.navigator.language.toLowerCase()
  return browserLocale.startsWith('ru') ? 'ru' : 'en'
}

export function LocaleProvider(props: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => detectInitialLocale())

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, locale)
    document.documentElement.setAttribute('lang', locale)
  }, [locale])

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (ru, en) => (locale === 'ru' ? ru : en),
    }),
    [locale],
  )

  return <LocaleContext.Provider value={value}>{props.children}</LocaleContext.Provider>
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider')
  }
  return context
}
