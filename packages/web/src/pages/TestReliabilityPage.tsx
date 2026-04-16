import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DotTimeline from '../components/charts/DotTimeline.js'
import DurationChart from '../components/charts/DurationChart.js'
import TestSearch from '../components/TestSearch.js'
import { useTestHistory } from '../hooks/useTestHistory.js'
import type { TestSearchResult } from '../lib/api.js'

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function StatPill({ label, value, color = '' }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-tn-border bg-tn-panel px-4 py-2 text-center">
      <p className={`font-display text-xl font-bold ${color || 'text-tn-fg'}`}>{value}</p>
      <p className="font-mono text-xs uppercase tracking-widest text-tn-muted">{label}</p>
    </div>
  )
}

export default function TestReliabilityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedTest, setSelectedTest] = useState<TestSearchResult | null>(null)
  const [limit, setLimit] = useState(25)
  const [branch] = useState<string | undefined>(undefined)

  const testIdParam = searchParams.get('testId')

  const { data, isLoading } = useTestHistory(selectedTest?.testId ?? testIdParam, limit, branch)

  // When arriving with ?testId= in URL, populate selectedTest from history response
  useEffect(() => {
    if (data?.test && !selectedTest) {
      setSelectedTest(data.test)
    }
  }, [data?.test, selectedTest])

  function handleSelect(test: TestSearchResult) {
    setSelectedTest(test)
    setSearchParams({ testId: test.testId })
  }

  const history = data?.history ?? []
  const passRate =
    history.length > 0
      ? Math.round((history.filter((h) => h.status === 'passed').length / history.length) * 100)
      : null
  const flakyCount = history.filter((h) => h.retry > 0 && h.status === 'passed').length
  const failCount = history.filter((h) =>
    ['failed', 'timedOut', 'interrupted'].includes(h.status),
  ).length
  const avgDuration =
    history.length > 0
      ? Math.round(history.reduce((s, h) => s + h.durationMs, 0) / history.length)
      : null

  // Duration chart data (convert history entries to TimelineBucket shape)
  const durationBuckets = history.map((h) => ({
    key: h.runId,
    startedAt: h.startedAt,
    runCount: 1,
    total: 1,
    passed: h.status === 'passed' ? 1 : 0,
    failed: h.status !== 'passed' ? 1 : 0,
    flaky: h.retry > 0 && h.status === 'passed' ? 1 : 0,
    avgDurationMs: h.durationMs,
    p95DurationMs: h.durationMs,
  }))

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Breadcrumb */}
      <p className="mb-4 font-mono text-xs text-tn-muted">
        <Link to="/charts" className="text-tn-blue hover:underline">
          Charts
        </Link>
        <span className="mx-2">›</span>
        <span>Test Reliability</span>
      </p>

      <h1 className="mb-6 font-display text-2xl font-bold">Test Reliability</h1>

      {/* Search */}
      <div className="mb-6">
        <TestSearch onSelect={handleSelect} />
      </div>

      {/* Selected test info + stats */}
      {selectedTest && (
        <>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-sm text-tn-fg">{selectedTest.titlePath.join(' › ')}</p>
              <p className="font-mono text-xs text-tn-muted">{selectedTest.locationFile}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {passRate !== null && (
                <StatPill label="Pass rate" value={`${passRate}%`} color="text-tn-green" />
              )}
              <StatPill label="Flaky runs" value={String(flakyCount)} color="text-tn-yellow" />
              <StatPill label="Failures" value={String(failCount)} color="text-tn-red" />
              {avgDuration !== null && <StatPill label="Avg duration" value={fmtMs(avgDuration)} />}
            </div>
          </div>

          {/* Controls */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex overflow-hidden rounded border border-tn-border font-mono text-xs">
              {[25, 50, 0].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLimit(l || 200)}
                  className={`border-none px-3 py-1.5 transition-colors ${
                    (l === 0 ? limit === 200 : limit === l)
                      ? 'bg-tn-blue/20 text-tn-blue'
                      : 'bg-tn-highlight text-tn-muted hover:text-tn-fg'
                  }`}
                >
                  {l === 0 ? 'All' : `Last ${l}`}
                </button>
              ))}
            </div>
          </div>

          {/* Dot timeline */}
          <div className="mb-4">
            <p className="mb-2 font-mono text-xs uppercase tracking-widest text-tn-muted">
              Run history (oldest → newest)
            </p>
            {isLoading ? (
              <div className="h-16 animate-pulse rounded-lg border border-tn-border bg-tn-highlight" />
            ) : (
              <DotTimeline history={history} />
            )}
          </div>

          {/* Duration sub-chart */}
          {!isLoading && history.length > 0 && (
            <div className="rounded-xl border border-tn-border bg-tn-panel p-4">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest text-tn-muted">
                Duration per run
              </p>
              <DurationChart data={durationBuckets} height={140} />
            </div>
          )}
        </>
      )}

      <p className="mt-8 font-mono text-xs">
        <Link to="/charts" className="text-tn-blue hover:underline">
          ← Back to all charts
        </Link>
      </p>
    </div>
  )
}
