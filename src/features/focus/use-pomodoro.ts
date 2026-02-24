import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '../../lib/api'
import type { FocusSessionView } from '../../types/api'
import {
  completeCurrentPhase,
  createInitialRuntime,
  normalizePomodoroConfig,
  phaseDurationSec,
  resetRuntime,
  skipCurrentPhase,
  type PomodoroConfig,
  type PomodoroRuntime,
} from './pomodoro-engine'
import {
  buildPausedRuntimeFromBackend,
  createStorageEnvelope,
  normalizeStoredRuntime,
  shouldUseBackendSession,
} from './pomodoro-storage'

const CONFIG_STORAGE_KEY = 'snorgnote.pomodoro.config'
const RUNTIME_STORAGE_KEY = 'snorgnote.pomodoro.runtime'

function readStoredConfig(): PomodoroConfig {
  if (typeof window === 'undefined') {
    return normalizePomodoroConfig({})
  }
  try {
    const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) {
      return normalizePomodoroConfig({})
    }
    const parsed = JSON.parse(raw) as Partial<PomodoroConfig>
    return normalizePomodoroConfig(parsed)
  } catch {
    return normalizePomodoroConfig({})
  }
}

function readStoredRuntime(config: PomodoroConfig): PomodoroRuntime {
  if (typeof window === 'undefined') {
    return createInitialRuntime(config)
  }
  try {
    const raw = window.localStorage.getItem(RUNTIME_STORAGE_KEY)
    if (!raw) {
      return createInitialRuntime(config)
    }
    const parsed = JSON.parse(raw)
    const restored = normalizeStoredRuntime(parsed)
    return restored ?? createInitialRuntime(config)
  } catch {
    return createInitialRuntime(config)
  }
}

export type PomodoroController = {
  config: PomodoroConfig
  runtime: PomodoroRuntime
  activeSession: FocusSessionView | null
  notice: string | null
  error: string | null
  statsTick: number
  setConfigValues: (next: Partial<PomodoroConfig>) => void
  start: () => Promise<void>
  pause: () => Promise<void>
  stop: () => Promise<void>
  skip: () => Promise<void>
  reset: () => Promise<void>
}

export function usePomodoro(projectId: string): PomodoroController {
  const [config, setConfig] = useState<PomodoroConfig>(() => readStoredConfig())
  const [runtime, setRuntime] = useState<PomodoroRuntime>(() =>
    readStoredRuntime(readStoredConfig()),
  )
  const [activeSession, setActiveSession] = useState<FocusSessionView | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statsTick, setStatsTick] = useState(0)
  const [completionToken, setCompletionToken] = useState(0)

  const configRef = useRef(config)
  const runtimeRef = useRef(runtime)
  const activeSessionRef = useRef<FocusSessionView | null>(activeSession)

  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    runtimeRef.current = runtime
  }, [runtime])

  useEffect(() => {
    activeSessionRef.current = activeSession
  }, [activeSession])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config))
  }, [config])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem(
      RUNTIME_STORAGE_KEY,
      JSON.stringify(createStorageEnvelope(runtime)),
    )
  }, [runtime])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const active = await api.focusActive()
        if (cancelled || !active.active || !active.session) {
          return
        }

        let session = active.session
        if (session.status !== 'paused') {
          session = await api.focusPause()
        }
        if (cancelled) {
          return
        }

        setActiveSession(session)
        if (shouldUseBackendSession(runtimeRef.current, session)) {
          setRuntime(
            buildPausedRuntimeFromBackend(
              session,
              configRef.current.focus_min * 60,
            ),
          )
          setNotice('Фокус-сессия восстановлена и поставлена на паузу.')
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Не удалось восстановить сессию фокуса',
          )
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!runtime.is_running) {
      return
    }
    const interval = window.setInterval(() => {
      const snapshot = runtimeRef.current
      if (!snapshot.is_running) {
        return
      }
      if (snapshot.remaining_sec <= 1) {
        setRuntime({
          ...snapshot,
          remaining_sec: 0,
          is_running: false,
        })
        setCompletionToken((value) => value + 1)
        return
      }
      setRuntime({
        ...snapshot,
        remaining_sec: snapshot.remaining_sec - 1,
      })
    }, 1000)

    return () => {
      window.clearInterval(interval)
    }
  }, [runtime.is_running])

  useEffect(() => {
    if (completionToken === 0) {
      return
    }
    void (async () => {
      const snapshot = runtimeRef.current
      setError(null)
      try {
        if (snapshot.phase === 'focus' && activeSessionRef.current) {
          await api.focusStop()
          setActiveSession(null)
          setStatsTick((value) => value + 1)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка завершения focus-сессии')
      }

      setRuntime((current) => completeCurrentPhase(current, configRef.current))
      setNotice('Фаза завершена. Нажмите Start для следующей фазы.')
    })()
  }, [completionToken])

  const setConfigValues = useCallback((next: Partial<PomodoroConfig>) => {
    const normalized = normalizePomodoroConfig({
      ...configRef.current,
      ...next,
    })
    setConfig(normalized)
    setRuntime((current) => {
      const maxForPhase = phaseDurationSec(current.phase, normalized)
      return {
        ...current,
        is_running: false,
        remaining_sec: Math.min(current.remaining_sec, maxForPhase),
      }
    })
    setNotice('Параметры таймера обновлены.')
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setNotice(null)

    const snapshot = runtimeRef.current
    if (snapshot.is_running) {
      return
    }

    try {
      if (snapshot.phase === 'focus') {
        const session = activeSessionRef.current
        if (!session) {
          const started = await api.focusStart(projectId || undefined, undefined)
          setActiveSession(started)
        } else if (session.status === 'paused') {
          const resumed = await api.focusResume()
          setActiveSession(resumed)
        }
      }

      setRuntime((current) => ({
        ...current,
        is_running: true,
      }))
      setNotice('Таймер запущен.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить таймер')
    }
  }, [projectId])

  const pause = useCallback(async () => {
    setError(null)
    const snapshot = runtimeRef.current
    if (!snapshot.is_running) {
      return
    }

    try {
      if (snapshot.phase === 'focus' && activeSessionRef.current?.status === 'running') {
        const paused = await api.focusPause()
        setActiveSession(paused)
      }
      setRuntime((current) => ({
        ...current,
        is_running: false,
      }))
      setNotice('Таймер на паузе.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось поставить таймер на паузу')
    }
  }, [])

  const stop = useCallback(async () => {
    setError(null)
    try {
      if (runtimeRef.current.phase === 'focus' && activeSessionRef.current) {
        await api.focusStop()
        setActiveSession(null)
        setStatsTick((value) => value + 1)
      }
      setRuntime((current) => ({
        ...current,
        is_running: false,
      }))
      setNotice('Таймер остановлен.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось остановить таймер')
    }
  }, [])

  const skip = useCallback(async () => {
    setError(null)
    try {
      if (runtimeRef.current.phase === 'focus' && activeSessionRef.current) {
        await api.focusStop()
        setActiveSession(null)
        setStatsTick((value) => value + 1)
      }

      setRuntime((current) => skipCurrentPhase(current, configRef.current))
      setNotice('Фаза пропущена.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось пропустить фазу')
    }
  }, [])

  const reset = useCallback(async () => {
    setError(null)
    try {
      if (activeSessionRef.current) {
        await api.focusStop()
        setActiveSession(null)
        setStatsTick((value) => value + 1)
      }
      setRuntime((current) => resetRuntime(current, configRef.current))
      setNotice('Таймер сброшен.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить таймер')
    }
  }, [])

  return {
    config,
    runtime,
    activeSession,
    notice,
    error,
    statsTick,
    setConfigValues,
    start,
    pause,
    stop,
    skip,
    reset,
  }
}

