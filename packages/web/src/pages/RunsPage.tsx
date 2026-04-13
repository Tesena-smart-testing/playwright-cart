import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FilterBar } from '../components/FilterBar.js'
import RunsTable from '../components/RunsTable.js'
import StatsBar from '../components/StatsBar.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useRuns } from '../hooks/useRuns.js'
import { useRunsMeta } from '../hooks/useRunsMeta.js'
import { useSettings } from '../hooks/useSettings.js'
import { updateMe } from '../lib/api.js'

const PAGE_SIZES = [10, 25, 50, 100] as const
type PageSize = (typeof PAGE_SIZES)[number]

export default function RunsPage() {
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const { user, isAdmin } = useCurrentUser()
  const { data: settings } = useSettings()
  const { data: meta } = useRunsMeta()
  const retentionDays = settings?.data_retention_days ?? 90

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)

  // Sync pageSize from user preference once user data loads
  useEffect(() => {
    if (user?.runsPerPage && PAGE_SIZES.includes(user.runsPerPage as PageSize)) {
      setPageSize(user.runsPerPage as PageSize)
    }
  }, [user?.runsPerPage])

  // Reset to page 1 when filters change
  const project = params.get('project') || undefined
  const branch = params.get('branch') || undefined
  const status = params.get('status') || undefined
  const tags = params.getAll('tag').sort()

  // biome-ignore lint/correctness/useExhaustiveDependencies: derived from params — reactive via URLSearchParams
  useEffect(() => {
    setPage(1)
  }, [project, branch, status, tags.join('\0')])

  const { data, isLoading, error, refetch } = useRuns({
    page,
    pageSize,
    project,
    branch,
    status,
    tags,
  })

  async function handlePageSizeChange(size: PageSize) {
    setPageSize(size)
    setPage(1)
    try {
      await updateMe({ runsPerPage: size })
      queryClient.invalidateQueries({ queryKey: ['me'] })
    } catch {
      // best-effort: local state already updated
    }
  }

  if (isLoading && !data) return <Skeleton />

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="mb-2 font-mono text-sm text-tn-red">Failed to load runs.</p>
        <p className="mb-4 font-mono text-xs text-tn-muted">{error.message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-tn-border px-4 py-2 font-display text-sm text-tn-fg transition-colors hover:bg-tn-highlight"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data || (data.total === 0 && !project && !branch && !status && tags.length === 0)) {
    return <EmptyState />
  }

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))

  return (
    <div>
      {/* Page header: title left, page-size selector + filters right */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="font-display text-lg font-bold uppercase tracking-[0.15em] text-tn-fg">
          Runs
        </h1>
        <div className="flex items-center gap-3">
          {/* Page size selector */}
          <div className="flex items-center gap-1">
            {PAGE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => handlePageSizeChange(size)}
                className={[
                  'rounded px-2 py-1 font-display text-xs transition-colors',
                  pageSize === size
                    ? 'bg-tn-highlight text-tn-fg'
                    : 'text-tn-muted hover:text-tn-fg',
                ].join(' ')}
              >
                {size}
              </button>
            ))}
          </div>
          <span className="text-tn-border select-none">|</span>
          <FilterBar
            projects={meta?.projects ?? []}
            branches={meta?.branches ?? []}
            tags={meta?.tags ?? []}
          />
        </div>
      </div>

      {/* Stats strip */}
      <StatsBar total={data.total} totalPassed={data.totalPassed} totalFailed={data.totalFailed} />

      {/* Table */}
      <RunsTable
        runs={data.runs}
        isAdmin={isAdmin}
        retentionDays={retentionDays}
        onDeleteSuccess={() => refetch()}
      />

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between font-display text-xs text-tn-muted">
          <span>{data.total} runs</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-tn-border px-3 py-1.5 transition-colors hover:bg-tn-highlight disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-tn-border px-3 py-1.5 transition-colors hover:bg-tn-highlight disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="flex items-center justify-between">
        <div className="h-5 w-16 rounded bg-tn-panel" />
        <div className="h-5 w-48 rounded bg-tn-panel" />
      </div>
      <div className="flex gap-8">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-24 rounded bg-tn-panel" />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-tn-border bg-tn-panel">
        <div className="h-10 border-b-2 border-tn-border" />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 border-b border-tn-border last:border-0" />
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="py-20 text-center">
      <div className="mb-6 font-display text-7xl font-bold leading-none text-tn-border">PW</div>
      <h2 className="mb-2 font-display text-lg font-bold text-tn-fg">No test runs yet</h2>
      <p className="mb-8 text-sm text-tn-muted">
        Add the reporter to your Playwright config to get started:
      </p>
      <pre className="mx-auto max-w-xl overflow-x-auto rounded-xl border border-tn-border bg-tn-panel p-5 text-left font-mono text-xs text-tn-fg">
        {`// playwright.config.ts
reporter: [
  ['html'],
  ['@playwright-cart/reporter', {
    serverUrl: 'http://localhost:3001',
    project: 'my-app',
    apiKey: 'your api-key',
    uploadConcurrency: 'optional: default is 3',
    retries: 'optional: default is 3',
    retryDelay: 'optional: default is 500ms, doubles each attempt',
    branch: 'optional: git branch name',
    commitSha: 'optional: git commit SHA',
  }],
]`}
      </pre>
    </div>
  )
}
