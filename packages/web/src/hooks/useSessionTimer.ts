import { useEffect, useRef, useState } from 'react'

export type SessionUrgency = 'normal' | 'warning' | 'critical'

export interface SessionTimerState {
  secondsRemaining: number
  fraction: number
  urgency: SessionUrgency
  tooltipLabel: string
}

const TOTAL_SECONDS = 8 * 60 * 60

function getTickMs(secondsRemaining: number): number {
  if (secondsRemaining < 60) return 5_000
  if (secondsRemaining < 600) return 10_000
  if (secondsRemaining < 1800) return 30_000
  return 60_000
}

function getUrgency(secondsRemaining: number): SessionUrgency {
  if (secondsRemaining < 600) return 'critical'
  if (secondsRemaining < 1800) return 'warning'
  return 'normal'
}

function formatTooltip(secondsRemaining: number, urgency: SessionUrgency): string {
  if (secondsRemaining <= 0) return 'Session expired — please log in again'
  const totalMins = Math.ceil(secondsRemaining / 60)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const timeStr = urgency === 'critical' || h === 0 ? `${m}m` : `${h}h ${m}m`
  return `Session expires in ${timeStr} · login required after`
}

function snapshot(expiresAt: number): SessionTimerState {
  const nowSec = Date.now() / 1000
  const secondsRemaining = Math.max(0, Math.round(expiresAt - nowSec))
  const urgency = getUrgency(secondsRemaining)
  return {
    secondsRemaining,
    fraction: Math.min(1, secondsRemaining / TOTAL_SECONDS),
    urgency,
    tooltipLabel: formatTooltip(secondsRemaining, urgency),
  }
}

export function useSessionTimer(expiresAt: number | undefined): SessionTimerState | null {
  const [state, setState] = useState<SessionTimerState | null>(() =>
    expiresAt != null ? snapshot(expiresAt) : null,
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (expiresAt == null) {
      setState(null)
      return
    }

    const expiresAtValue = expiresAt

    function schedule() {
      const current = snapshot(expiresAtValue)
      setState(current)
      if (current.secondsRemaining <= 0) return
      timerRef.current = setTimeout(schedule, getTickMs(current.secondsRemaining))
    }

    function handleVisibility() {
      if (!document.hidden) {
        if (timerRef.current) clearTimeout(timerRef.current)
        schedule()
      }
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [expiresAt])

  return state
}
