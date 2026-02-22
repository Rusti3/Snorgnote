import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, UIEvent } from 'react'

import { cn } from '../lib/utils'

const DEFAULT_OVERSCAN = 6

type VirtualListProps<T> = {
  items: T[]
  itemHeight: number
  maxHeightClassName: string
  className?: string
  overscan?: number
  getKey: (item: T, index: number) => string
  renderItem: (item: T, index: number) => ReactNode
  emptyState?: ReactNode
}

export function VirtualList<T>(props: VirtualListProps<T>) {
  const {
    items,
    itemHeight,
    maxHeightClassName,
    className,
    overscan = DEFAULT_OVERSCAN,
    getKey,
    renderItem,
    emptyState = null,
  } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(itemHeight * 6)

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const update = () => setViewportHeight(node.clientHeight || itemHeight * 6)
    update()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [itemHeight])

  useEffect(() => {
    setScrollTop(0)
    if (containerRef.current) {
      containerRef.current.scrollTop = 0
    }
  }, [items.length])

  const range = useMemo(() => {
    if (items.length === 0) {
      return { start: 0, end: 0, top: 0, bottom: 0 }
    }

    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
    const visibleCount = Math.ceil(viewportHeight / itemHeight) + overscan * 2
    const end = Math.min(items.length, start + visibleCount)

    return {
      start,
      end,
      top: start * itemHeight,
      bottom: Math.max(0, (items.length - end) * itemHeight),
    }
  }, [itemHeight, items.length, overscan, scrollTop, viewportHeight])

  const visibleItems = useMemo(
    () => items.slice(range.start, range.end),
    [items, range.end, range.start],
  )

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={cn('overflow-auto pr-1', maxHeightClassName, className)}
    >
      {items.length === 0 ? (
        emptyState
      ) : (
        <div style={{ paddingTop: range.top, paddingBottom: range.bottom }}>
          {visibleItems.map((item, index) => {
            const absoluteIndex = range.start + index
            return (
              <div key={getKey(item, absoluteIndex)} style={{ minHeight: itemHeight }}>
                {renderItem(item, absoluteIndex)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
