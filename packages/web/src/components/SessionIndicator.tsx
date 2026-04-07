import type { SessionTimerState } from '../hooks/useSessionTimer.js'

// Full circular ring countdown: depletes clockwise from 12 o'clock.
// A single value in strokeDasharray means dash=CIRC, gap=CIRC — the whole
// circumference is one dash, so the ring is solid when dashoffset=0.
const R = 11
const CIRC = 2 * Math.PI * R // full circumference ≈ 69.115

const URGENCY_COLOR: Record<string, string> = {
  normal: 'var(--tn-blue)',
  warning: 'var(--tn-yellow)',
  critical: 'var(--tn-red)',
}

interface Props {
  timer: SessionTimerState
}

export default function SessionIndicator({ timer }: Props) {
  const color = URGENCY_COLOR[timer.urgency]
  const isCritical = timer.urgency === 'critical'
  const dashOffset = CIRC * (1 - timer.fraction)

  return (
    <div className="group relative flex items-center justify-center">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-label={timer.tooltipLabel} role="img">
        {/* Background ring */}
        <circle cx="14" cy="14" r={R} fill="none" stroke="var(--tn-border)" strokeWidth="2.5" />

        {/* Countdown ring — rotate(-90) starts depletion from 12 o'clock */}
        <circle
          cx="14"
          cy="14"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 14 14)"
          className={isCritical ? 'session-indicator-critical' : undefined}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease' }}
        />
      </svg>

      {/* Tooltip — visible on hover via CSS group */}
      <div
        role="tooltip"
        className="pointer-events-none invisible absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded border border-tn-border bg-tn-panel px-2.5 py-1.5 font-mono text-xs text-tn-fg opacity-0 shadow-xl transition-opacity duration-150 group-hover:visible group-hover:opacity-100"
      >
        {timer.tooltipLabel}
      </div>
    </div>
  )
}
