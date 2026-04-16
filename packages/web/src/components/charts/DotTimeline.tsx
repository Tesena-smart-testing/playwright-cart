import { useState } from 'react'
import type { TestHistoryEntry } from '../../lib/api.js'

const STATUS_COLOR: Record<TestHistoryEntry['status'], string> = {
  passed: 'bg-tn-green',
  failed: 'bg-tn-red',
  timedOut: 'bg-tn-red',
  interrupted: 'bg-tn-red',
  skipped: 'bg-tn-muted',
}

function dotColor(entry: TestHistoryEntry): string {
  if (entry.retry > 0 && entry.status === 'passed') return 'bg-tn-yellow'
  return STATUS_COLOR[entry.status]
}

function dotLabel(entry: TestHistoryEntry): string {
  if (entry.retry > 0 && entry.status === 'passed') return 'flaky'
  return entry.status
}

interface TooltipState {
  entry: TestHistoryEntry
  x: number
  y: number
}

interface Props {
  history: TestHistoryEntry[]
}

export default function DotTimeline({ history }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const ordered = [...history].reverse() // oldest first → newest right

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-tn-border bg-tn-panel p-4">
        {ordered.map((entry) => (
          <button
            key={entry.runId}
            type="button"
            className={`size-4 rounded-full transition-transform hover:scale-125 ${dotColor(entry)}`}
            onMouseEnter={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const parent = e.currentTarget.closest('.relative')?.getBoundingClientRect()
              if (!parent) return
              setTooltip({ entry, x: rect.left - parent.left + 8, y: rect.top - parent.top - 60 })
            }}
            onMouseLeave={() => setTooltip(null)}
            aria-label={`${entry.startedAt.slice(0, 10)} — ${dotLabel(entry)}`}
          />
        ))}
      </div>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-tn-border bg-tn-panel px-3 py-2 font-mono text-xs shadow-xl"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="text-tn-fg">{tooltip.entry.startedAt.slice(0, 10)}</p>
          <p className="text-tn-muted">{tooltip.entry.runId}</p>
          {tooltip.entry.branch && <p className="text-tn-muted">branch: {tooltip.entry.branch}</p>}
          <p
            className={`font-semibold ${
              dotLabel(tooltip.entry) === 'flaky'
                ? 'text-tn-yellow'
                : tooltip.entry.status === 'passed'
                  ? 'text-tn-green'
                  : tooltip.entry.status === 'skipped'
                    ? 'text-tn-muted'
                    : 'text-tn-red'
            }`}
          >
            {dotLabel(tooltip.entry)}
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-tn-muted">
        {[
          { color: 'bg-tn-green', label: 'passed' },
          { color: 'bg-tn-red', label: 'failed' },
          { color: 'bg-tn-yellow', label: 'flaky' },
          { color: 'bg-tn-muted', label: 'skipped' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
