import { useSearchParams } from 'react-router-dom'
import { FilterBar, applyFilters } from '../components/FilterBar.js'
import RunsTable from '../components/RunsTable.js'
import StatsBar from '../components/StatsBar.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useRuns } from '../hooks/useRuns.js'

export default function RunsPage() {
  const [params] = useSearchParams()
  const { data: runs, isLoading, error, refetch } = useRuns()
  const { isAdmin } = useCurrentUser()

  if (isLoading) return <Skeleton />

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="mb-2 text-tn-red">Failed to load runs.</p>
        <p className="mb-4 text-sm text-tn-muted">{error.message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded border border-tn-border px-4 py-2 text-sm text-tn-fg transition-colors hover:bg-tn-highlight"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!runs || runs.length === 0) return <EmptyState />

  const filtered = applyFilters(runs, params)

  return (
    <div>
      <StatsBar runs={runs} />
      <FilterBar runs={runs} />
      <RunsTable runs={filtered} isAdmin={isAdmin} onDeleteSuccess={() => refetch()} />
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-tn-highlight" />
        ))}
      </div>
      <div className="h-8 w-64 rounded bg-tn-highlight" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 rounded bg-tn-highlight" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <p className="mb-4 text-4xl">🎭</p>
      <h2 className="mb-2 text-lg font-semibold text-tn-fg">No test runs yet</h2>
      <p className="mb-6 text-sm text-tn-muted">
        Add the reporter to your Playwright config to get started:
      </p>
      <pre className="mx-auto max-w-xl overflow-x-auto rounded-lg border border-tn-border bg-tn-panel p-4 text-left text-xs text-tn-fg">
        {`// playwright.config.ts
reporter: [
  ['html'],
  ['@playwright-cart/reporter', {
    serverUrl: 'http://localhost:3001',
    project: 'my-app',
  }],
]`}
      </pre>
    </div>
  )
}
