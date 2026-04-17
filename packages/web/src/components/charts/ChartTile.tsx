import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useNavigate } from 'react-router-dom'
import type { TimelineBucket } from '../../lib/api.js'
import type { ChartId } from '../../lib/charts.js'
import { getChartConfig } from '../../lib/charts.js'
import TrendChart from './TrendChart.js'

function getSparklineValue(id: ChartId, bucket: TimelineBucket): number {
  if (id === 'pass-rate')
    return bucket.total > 0 ? Math.round((bucket.passed / bucket.total) * 100) : 0
  if (id === 'failures') return bucket.failed
  if (id === 'flaky') return bucket.flaky
  if (id === 'duration') return bucket.avgDurationMs
  if (id === 'total-tests') return bucket.total
  return 0
}

function getStat(
  id: ChartId,
  buckets: TimelineBucket[],
): { value: string; delta: string; up: boolean } {
  if (buckets.length === 0) return { value: '—', delta: '—', up: true }
  const latest = buckets[buckets.length - 1]
  const prev = buckets.length > 1 ? buckets[buckets.length - 2] : null
  const cur = getSparklineValue(id, latest)
  const prevVal = prev ? getSparklineValue(id, prev) : null

  let value: string
  if (id === 'pass-rate') value = `${cur}%`
  else if (id === 'duration')
    value = cur < 60_000 ? `${(cur / 1000).toFixed(1)}s` : `${Math.floor(cur / 60_000)}m`
  else value = String(cur)

  const delta = prevVal !== null ? cur - prevVal : 0
  const sign = delta >= 0 ? '+' : ''
  const deltaStr =
    id === 'pass-rate'
      ? `${sign}${delta}%`
      : id === 'duration'
        ? `${sign}${(delta / 1000).toFixed(1)}s`
        : `${sign}${delta}`

  const up = id === 'failures' || id === 'flaky' ? delta <= 0 : delta >= 0
  return { value, delta: deltaStr, up }
}

interface Props {
  id: ChartId
  buckets: TimelineBucket[]
  isLoading: boolean
}

export default function ChartTile({ id, buckets, isLoading }: Props) {
  const config = getChartConfig(id)
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const stat = getStat(id, buckets)
  const isReliability = id === 'test-reliability'

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative flex flex-col gap-3 rounded-xl border border-tn-border bg-tn-panel p-4 transition-colors hover:border-current"
    >
      {/* Drag handle */}
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute right-3 top-3 cursor-grab text-tn-muted opacity-0 transition-opacity group-hover:opacity-60 active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        ⠿
      </button>

      {/* Header */}
      <div className="flex items-start justify-between pr-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-tn-muted">
            {config.label}
          </p>
          {!isReliability && (
            <p className={`mt-1 font-display text-2xl font-bold ${config.colorClass}`}>
              {isLoading ? '…' : stat.value}
            </p>
          )}
        </div>
        {!isReliability && !isLoading && (
          <span
            className="group/delta relative inline-block"
            aria-describedby={`delta-tooltip-${id}`}
          >
            <span
              className={`rounded-full px-2 py-0.5 font-mono text-xs ${stat.up ? 'bg-tn-green/15 text-tn-green' : 'bg-tn-red/15 text-tn-red'}`}
            >
              {stat.delta}
            </span>
            <span
              id={`delta-tooltip-${id}`}
              role="tooltip"
              className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 whitespace-normal rounded border border-tn-border bg-tn-panel px-2.5 py-1.5 font-mono text-xs text-tn-fg opacity-0 shadow-xl transition-opacity duration-150 group-hover/delta:visible group-hover/delta:opacity-100"
            >
              {config.deltaTooltip}
            </span>
          </span>
        )}
      </div>

      {/* Chart / placeholder */}
      <button
        type="button"
        className="cursor-pointer text-left"
        onClick={() => navigate(config.path)}
        aria-label={`Open ${config.label} chart`}
      >
        {isReliability ? (
          <div className="flex h-[80px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-tn-border text-tn-muted">
            <span className="text-lg">Search</span>
            <span className="font-mono text-xs">Search a test...</span>
          </div>
        ) : isLoading ? (
          <div className="h-[80px] animate-pulse rounded bg-tn-highlight" />
        ) : (
          <TrendChart
            data={buckets}
            color={config.colorHex}
            getValue={(b) => getSparklineValue(id, b)}
            label={config.label}
            height={80}
          />
        )}
      </button>

      <p className="font-mono text-xs text-tn-muted">
        {isReliability
          ? 'Per-test history · click to explore →'
          : 'Last 30 days · click to expand →'}
      </p>
    </div>
  )
}
