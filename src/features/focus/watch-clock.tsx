import { useEffect, useMemo, useState } from 'react'

import { useTheme } from '../../lib/theme'
import type { PomodoroPhase } from './pomodoro-engine'

type WatchClockProps = {
  phase: PomodoroPhase
  remainingSec: number
  totalSec: number
  running: boolean
  caption: string
}

const ROMAN_NUMERALS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI']

function polarOffset(index: number, total: number, radius: number) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.max(0, Math.min(1, value))
}

export function WatchClock(props: WatchClockProps) {
  const { phase, remainingSec, totalSec, running, caption } = props
  const { resolvedTheme } = useTheme()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const palette = useMemo(() => {
    if (resolvedTheme === 'dark') {
      return {
        frame: 'conic-gradient(from 0deg, #3a3d44, #8a8f9a, #343840, #1f222a, #3a3d44)',
        ring: '#2b2f36',
        face: 'radial-gradient(circle at 30% 28%, #2c3038 0%, #1f232a 70%)',
        text: '#d8deea',
        accent: '#b9c6ff',
        hand: '#f4f6fb',
        second: '#ff8377',
        marker: '#8a93a5',
        markerHour: '#d0d6e6',
        glow: 'rgba(145, 170, 255, 0.35)',
      }
    }

    return {
      frame: 'conic-gradient(from 0deg, #9f886f, #e7ded2, #9f886f, #74604a, #9f886f)',
      ring: '#55463a',
      face: 'radial-gradient(circle at 28% 26%, #fcf7ee 0%, #e6dbc9 72%)',
      text: '#2f2118',
      accent: '#7f5c47',
      hand: '#1f150f',
      second: '#a6352b',
      marker: '#7f6b58',
      markerHour: '#2f2118',
      glow: 'rgba(177, 122, 82, 0.35)',
    }
  }, [resolvedTheme])

  const safeTotal = Math.max(1, totalSec)
  const progress = clampProgress((safeTotal - Math.max(0, remainingSec)) / safeTotal)
  const minuteDeg = progress * 360
  const hourDeg = progress * 30
  const secondDeg = now.getSeconds() * 6

  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <div
        className="relative aspect-square rounded-full p-4 shadow-[0_26px_65px_rgba(0,0,0,0.35)]"
        style={{ background: palette.frame }}
      >
        <div
          className="relative h-full w-full rounded-full p-2"
          style={{
            backgroundColor: palette.ring,
            boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.2), inset 0 -2px 10px rgba(0,0,0,0.35)',
          }}
        >
          <div
            className="relative h-full w-full overflow-hidden rounded-full"
            style={{
              background: palette.face,
              boxShadow: `inset 0 0 28px ${palette.glow}`,
            }}
          >
            <div className="absolute inset-0">
              {Array.from({ length: 60 }).map((_, index) => {
                const isHour = index % 5 === 0
                return (
                  <div
                    key={index}
                    className="absolute left-1/2 top-0 h-full -translate-x-1/2"
                    style={{ transform: `translateX(-50%) rotate(${index * 6}deg)` }}
                  >
                    <div
                      className="mx-auto rounded-full"
                      style={{
                        marginTop: '8px',
                        width: isHour ? 2 : 1,
                        height: isHour ? 12 : 7,
                        backgroundColor: isHour ? palette.markerHour : palette.marker,
                        opacity: isHour ? 0.9 : 0.65,
                      }}
                    />
                  </div>
                )
              })}
            </div>

            <div className="absolute inset-0">
              {ROMAN_NUMERALS.map((label, index) => {
                const offset = polarOffset(index, ROMAN_NUMERALS.length, 126)
                return (
                  <div
                    key={label}
                    className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-[11px] font-semibold tracking-wide"
                    style={{
                      transform: `translate(${offset.x}px, ${offset.y}px)`,
                      color: palette.text,
                      fontFamily: '"Sora", sans-serif',
                    }}
                  >
                    {label}
                  </div>
                )
              })}
            </div>

            <div className="absolute inset-0">
              <div
                className="absolute left-1/2 top-1/2 w-1 -translate-x-1/2 rounded-full"
                style={{
                  height: 84,
                  transformOrigin: '50% 100%',
                  transform: `translateX(-50%) translateY(-100%) rotate(${hourDeg}deg)`,
                  backgroundColor: palette.hand,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                }}
              />
              <div
                className="absolute left-1/2 top-1/2 w-[3px] -translate-x-1/2 rounded-full"
                style={{
                  height: 118,
                  transformOrigin: '50% 100%',
                  transform: `translateX(-50%) translateY(-100%) rotate(${minuteDeg}deg)`,
                  backgroundColor: palette.hand,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                }}
              />
              <div
                className="absolute left-1/2 top-1/2 w-[2px] -translate-x-1/2 rounded-full"
                style={{
                  height: 132,
                  transformOrigin: '50% 88%',
                  transform: `translateX(-50%) translateY(-88%) rotate(${secondDeg}deg)`,
                  backgroundColor: palette.second,
                  opacity: running ? 1 : 0.4,
                }}
              />
              <div
                className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border"
                style={{
                  backgroundColor: palette.ring,
                  borderColor: palette.hand,
                }}
              />
            </div>

            <div
              className="absolute inset-x-6 bottom-6 rounded-xl border px-3 py-2 text-center backdrop-blur-sm"
              style={{
                borderColor: palette.marker,
                backgroundColor: resolvedTheme === 'dark' ? 'rgba(16, 19, 24, 0.58)' : 'rgba(252, 247, 238, 0.58)',
              }}
            >
              <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: palette.accent }}>
                {phase.replace('_', ' ')}
              </p>
              <p className="text-sm font-semibold" style={{ color: palette.text }}>
                {caption}
              </p>
            </div>

            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  'linear-gradient(132deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.08) 42%, rgba(255,255,255,0) 56%)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

