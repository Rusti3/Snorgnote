import { Minus, Square, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import type { Window as TauriWindow } from '@tauri-apps/api/window'

import { api } from '../lib/api'
import { useLocale } from '../lib/locale'
import { isWindowControlTarget, shouldStartWindowDrag } from './window-titlebar-utils'

const APP_NAME = 'Snorgnote'

export function WindowTitlebar() {
  const { t } = useLocale()
  const isTauriRuntime = api.isTauri()
  const [isMaximized, setIsMaximized] = useState(false)

  const withWindow = useCallback(
    async (operation: (windowApi: TauriWindow) => Promise<void>) => {
      if (!isTauriRuntime) return
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const appWindow = getCurrentWindow()
        await operation(appWindow)
      } catch (error) {
        console.error('window action failed', error)
      }
    },
    [isTauriRuntime],
  )

  const refreshMaximizedState = useCallback(async () => {
    if (!isTauriRuntime) return
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const appWindow = getCurrentWindow()
    const maximized = await appWindow.isMaximized()
    setIsMaximized(maximized)
  }, [isTauriRuntime])

  useEffect(() => {
    if (!isTauriRuntime) return

    let disposed = false
    let cleanup: (() => void) | null = null

    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const appWindow = getCurrentWindow()

        setIsMaximized(await appWindow.isMaximized())
        await appWindow.setTitle(APP_NAME)

        const unlistenResized = await appWindow.onResized(async () => {
          if (disposed) return
          setIsMaximized(await appWindow.isMaximized())
        })

        cleanup = () => {
          unlistenResized()
        }
      } catch (error) {
        console.error('failed to initialize window titlebar', error)
      }
    })()

    return () => {
      disposed = true
      if (cleanup) cleanup()
    }
  }, [isTauriRuntime])

  const onMinimize = useCallback(async () => {
    await withWindow(async (windowApi) => {
      await windowApi.minimize()
    })
  }, [withWindow])

  const onToggleMaximize = useCallback(async () => {
    await withWindow(async (windowApi) => {
      await windowApi.toggleMaximize()
    })
    await refreshMaximizedState()
  }, [refreshMaximizedState, withWindow])

  const onClose = useCallback(async () => {
    await withWindow(async (windowApi) => {
      await windowApi.close()
    })
  }, [withWindow])

  const onDragMouseDown = useCallback(
    async (event: MouseEvent<HTMLDivElement>) => {
      if (!isTauriRuntime) return
      if (!shouldStartWindowDrag(event.button)) return
      if (isWindowControlTarget(event.target)) return

      await withWindow(async (windowApi) => {
        await windowApi.startDragging()
      })
    },
    [isTauriRuntime, withWindow],
  )

  return (
    <div
      className="sticky top-0 z-50 flex h-11 items-center border-b border-[var(--border)] bg-[var(--titlebar-bg)]/95 backdrop-blur"
      data-tauri-drag-region
      onMouseDown={(event) => void onDragMouseDown(event)}
      onDoubleClick={(event) => {
        if (isWindowControlTarget(event.target)) return
        void onToggleMaximize()
      }}
    >
      <div
        className="flex min-w-0 flex-1 select-none items-center px-3"
      >
        <p className="truncate text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
          {APP_NAME}
        </p>
      </div>

      {isTauriRuntime ? (
        <div className="flex items-center gap-1 px-2">
          <button
            aria-label={t('Свернуть окно', 'Minimize window')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            data-window-control="true"
            onClick={() => void onMinimize()}
            type="button"
          >
            <Minus size={14} />
          </button>
          <button
            aria-label={t(
              isMaximized ? 'Восстановить окно' : 'Развернуть окно',
              isMaximized ? 'Restore window' : 'Maximize window',
            )}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            data-window-control="true"
            onClick={() => void onToggleMaximize()}
            type="button"
          >
            <Square size={13} />
          </button>
          <button
            aria-label={t('Закрыть окно', 'Close window')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--danger)] hover:text-white"
            data-window-control="true"
            onClick={() => void onClose()}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
