import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props
  return (
    <div
      className={cn(
        'sn-card-surface rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm',
        className,
      )}
      {...rest}
    />
  )
}
