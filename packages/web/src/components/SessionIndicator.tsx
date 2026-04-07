import type { SessionTimerState } from '../hooks/useSessionTimer.js'

// SVG arc geometry: 28×28 viewBox, center (14,14), radius 11, stroke-width 2.5
// Arc: 340° → 200° clockwise = 220° sweep (speedometer/gauge shape)
// Point at 340°: (14 + 11·cos(−20°), 14 + 11·sin(−20°)) ≈ (24.337, 10.238)
// Point at 200°: (14 + 11·cos(200°), 14 + 11·sin(200°)) ≈ (3.663, 10.238)
const ARC_PATH = 'M 24.337 10.238 A 11 11 0 1 1 3.663 10.238'
const FULL_CIRC = 2 * Math.PI * 11 // ≈ 69.115
const ARC_LEN = (220 / 360) * FULL_CIRC // ≈ 42.237
const GAP_LEN = FULL_CIRC - ARC_LEN // ≈ 26.878
const DASH_ARRAY = `${ARC_LEN} ${GAP_LEN}`

const URGENCY_COLOR: Record<string, string> = {
  normal: 'var(--tn-blue)',
  warning: 'var(--tn-yellow)',
  critical: 'var(--tn-red)',
}

interface Props {
  timer: SessionTimerState
}

export default function SessionIndicator({ timer }: Props) {
  const dashOffset = ARC_LEN * (1 - timer.fraction)
  const color = URGENCY_COLOR[timer.urgency]
  const isCritical = timer.urgency === 'critical'

  return (
    <div className="group relative flex items-center justify-center">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-label={timer.tooltipLabel} role="img">
        {/* Background track */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke="var(--tn-border)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={DASH_ARRAY}
          strokeDashoffset="0"
        />

        {/* Fill arc — depletes as session drains */}
        <path
          d={ARC_PATH}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={DASH_ARRAY}
          strokeDashoffset={dashOffset}
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
