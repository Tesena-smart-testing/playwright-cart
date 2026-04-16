import type { TimelineInterval } from '../../lib/api.js'

export interface ControlsValue {
  interval: TimelineInterval
  days: number
  limit: number
}

interface Props {
  value: ControlsValue
  onChange: (v: ControlsValue) => void
}

const INTERVALS: { value: TimelineInterval; label: string }[] = [
  { value: 'run', label: 'Per run' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
]

const DAY_OPTIONS = [7, 30, 90, 365]
const LIMIT_OPTIONS = [10, 25, 50]

export default function ChartControls({ value, onChange }: Props) {
  function btn(active: boolean) {
    return [
      'border-none px-3 py-1 font-mono text-xs transition-colors',
      active ? 'bg-tn-blue/20 text-tn-blue' : 'bg-tn-highlight text-tn-muted hover:text-tn-fg',
    ].join(' ')
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-tn-border bg-tn-panel px-3 py-2">
      {/* Granularity */}
      <div className="flex overflow-hidden rounded border border-tn-border">
        {INTERVALS.map((i) => (
          <button
            key={i.value}
            type="button"
            className={btn(value.interval === i.value)}
            onClick={() => onChange({ ...value, interval: i.value })}
          >
            {i.label}
          </button>
        ))}
      </div>

      {/* Date range (hidden in per-run mode — server uses limit instead) */}
      {value.interval !== 'run' && (
        <div className="flex overflow-hidden rounded border border-tn-border">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={btn(value.days === d)}
              onClick={() => onChange({ ...value, days: d })}
            >
              {d === 365 ? 'All' : `${d}d`}
            </button>
          ))}
        </div>
      )}

      {/* Run count (only for per-run granularity) */}
      {value.interval === 'run' && (
        <>
          <span className="font-mono text-xs text-tn-muted">or</span>
          <div className="flex overflow-hidden rounded border border-tn-border">
            {LIMIT_OPTIONS.map((l) => (
              <button
                key={l}
                type="button"
                className={btn(value.limit === l)}
                onClick={() => onChange({ ...value, limit: l })}
              >
                Last {l}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
