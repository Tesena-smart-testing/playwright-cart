import { useEffect, useId, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ChartControls, { type ControlsValue } from '../components/charts/ChartControls.js'
import ChartFilterBar, { type FilterValue } from '../components/charts/ChartFilterBar.js'
import DurationChart from '../components/charts/DurationChart.js'
import TrendChart from '../components/charts/TrendChart.js'
import { useRunsMeta } from '../hooks/useRunsMeta.js'
import { useRunTimeline } from '../hooks/useRunTimeline.js'
import type { TimelineBucket } from '../lib/api.js'
import { type ChartId, getChartConfig } from '../lib/charts.js'

const DETAIL_FILTER_KEY = 'playwright-cart.chart-detail-filter'
const DETAIL_CONTROLS_KEY = 'playwright-cart.chart-detail-controls'
const DEFAULT_CONTROLS: ControlsValue = { interval: 'day', days: 30, limit: 25 }

function readStoredDetailFilter(): FilterValue {
  try {
    return JSON.parse(localStorage.getItem(DETAIL_FILTER_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function readStoredDetailControls(): ControlsValue {
  try {
    return JSON.parse(localStorage.getItem(DETAIL_CONTROLS_KEY) ?? 'null') ?? DEFAULT_CONTROLS
  } catch {
    return DEFAULT_CONTROLS
  }
}

const CHART_CONFIGS_DETAIL: Record<
  Exclude<ChartId, 'test-reliability'>,
  {
    getValue: (b: TimelineBucket) => number
    formatValue: (v: number) => string
  }
> = {
  'pass-rate': {
    getValue: (b) => (b.total > 0 ? Math.round((b.passed / b.total) * 100) : 0),
    formatValue: (v) => `${v}%`,
  },
  failures: {
    getValue: (b) => b.failed,
    formatValue: (v) => String(v),
  },
  flaky: {
    getValue: (b) => b.flaky,
    formatValue: (v) => String(v),
  },
  'total-tests': {
    getValue: (b) => b.total,
    formatValue: (v) => String(v),
  },
  duration: {
    getValue: (b) => b.avgDurationMs,
    formatValue: (v) => (v < 60_000 ? `${(v / 1000).toFixed(1)}s` : `${Math.floor(v / 60_000)}m`),
  },
}

function describeControls(controls: ControlsValue): { unit: string; range: string } {
  if (controls.interval === 'run') {
    return { unit: 'run', range: `last ${controls.limit} runs` }
  }
  if (controls.interval === 'week') {
    return { unit: 'week', range: `last ${controls.days} days` }
  }
  return { unit: 'day', range: `last ${controls.days} days` }
}

function StatPill({
  label,
  value,
  tooltip,
  highlight = false,
}: {
  label: string
  value: string
  tooltip?: string
  highlight?: boolean
}) {
  const tooltipId = useId()
  return (
    <div tabIndex={tooltip ? 0 : undefined} className="group/pill relative">
      <div
        className={`rounded-lg border px-4 py-2 text-center ${highlight ? 'border-tn-green/30 bg-tn-green/10' : 'border-tn-border bg-tn-panel'}`}
      >
        <p
          aria-describedby={tooltip ? tooltipId : undefined}
          className={`font-display text-xl font-bold ${highlight ? 'text-tn-green' : 'text-tn-fg'}`}
        >
          {value}
        </p>
        <p className="font-mono text-xs uppercase tracking-widest text-tn-muted">{label}</p>
      </div>
      {tooltip && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 whitespace-normal rounded border border-tn-border bg-tn-panel px-2.5 py-1.5 font-mono text-xs text-tn-fg opacity-0 shadow-xl transition-opacity duration-150 group-hover/pill:visible group-hover/pill:opacity-100 group-focus-within/pill:visible group-focus-within/pill:opacity-100"
        >
          {tooltip}
        </span>
      )}
    </div>
  )
}

export default function ChartDetailPage() {
  const { chartId } = useParams<{ chartId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: meta } = useRunsMeta()

  const [controls, setControls] = useState<ControlsValue>(readStoredDetailControls)
  const [filter, setFilter] = useState<FilterValue>(() => {
    const project = searchParams.get('project') ?? undefined
    const branch = searchParams.get('branch') ?? undefined
    return project || branch ? { project, branch } : readStoredDetailFilter()
  })

  const validId = chartId as ChartId
  const config = getChartConfig(validId)

  const timelineParams =
    controls.interval === 'run'
      ? { interval: 'run' as const, limit: controls.limit, ...filter }
      : { interval: controls.interval, days: controls.days, ...filter }

  const invalid = !config || validId === 'test-reliability'
  const { data: buckets = [], isLoading } = useRunTimeline(timelineParams, !invalid)

  useEffect(() => {
    if (invalid) navigate('/charts', { replace: true })
  }, [invalid, navigate])

  useEffect(() => {
    localStorage.setItem(DETAIL_FILTER_KEY, JSON.stringify(filter))
  }, [filter])

  useEffect(() => {
    localStorage.setItem(DETAIL_CONTROLS_KEY, JSON.stringify(controls))
  }, [controls])

  if (invalid) return null

  const detail = CHART_CONFIGS_DETAIL[validId as Exclude<ChartId, 'test-reliability'>]
  const latest = buckets.length > 0 ? detail.getValue(buckets[buckets.length - 1]) : null
  const avg =
    buckets.length > 0
      ? Math.round(buckets.reduce((s, b) => s + detail.getValue(b), 0) / buckets.length)
      : null
  const { unit, range } = describeControls(controls)

  const currentTooltip =
    validId === 'pass-rate'
      ? `The share of individual tests that passed in the most recent ${unit}. Counts every single test case — not just whether the overall run passed or failed.`
      : `The value from the most recent ${unit} in the ${range}`

  const avgTooltip =
    validId === 'pass-rate'
      ? `The average share of individual tests passing across the ${range}. Because this counts every test separately, it may differ from the dashboard pass rate, which counts whole runs.`
      : `The average across all ${unit}s in the ${range}`

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Breadcrumb */}
      <p className="mb-4 font-mono text-xs text-tn-muted">
        <Link to="/charts" className="text-tn-blue hover:underline">
          Charts
        </Link>
        <span className="mx-2">›</span>
        <span>{config.label}</span>
      </p>

      {/* Header + stat pills */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={`font-display text-2xl font-bold ${config.colorClass}`}>
            {config.label} Trend
          </h1>
          <p className="mt-1 font-mono text-sm text-tn-muted">{config.description}</p>
        </div>
        <div className="flex gap-3">
          {latest !== null && (
            <StatPill
              label="Current"
              value={detail.formatValue(latest)}
              tooltip={currentTooltip}
              highlight
            />
          )}
          {avg !== null && (
            <StatPill label="Period avg" value={detail.formatValue(avg)} tooltip={avgTooltip} />
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3">
        <ChartControls value={controls} onChange={setControls} />
        {meta && (
          <ChartFilterBar value={filter} onChange={setFilter} meta={meta} label="Override" />
        )}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-tn-border bg-tn-panel p-6">
        {isLoading ? (
          <div className="h-[240px] animate-pulse rounded bg-tn-highlight" />
        ) : validId === 'duration' ? (
          <DurationChart data={buckets} height={240} interval={controls.interval} />
        ) : (
          <TrendChart
            data={buckets}
            color={config.colorHex}
            getValue={detail.getValue}
            formatValue={detail.formatValue}
            label={config.label}
            height={240}
            interval={controls.interval}
          />
        )}
      </div>

      <p className="mt-6 font-mono text-xs">
        <Link to="/charts" className="text-tn-blue hover:underline">
          ← Back to all charts
        </Link>
      </p>
    </div>
  )
}
