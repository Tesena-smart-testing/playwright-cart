import { Link, useParams } from 'react-router-dom'
import RunHeader from '../components/RunHeader.js'
import RunStats from '../components/RunStats.js'
import SuiteGroup, { type SuiteTreeNode } from '../components/SuiteGroup.js'
import { useRun } from '../hooks/useRun.js'
import type { AnnotatedRunWithTests, AnnotatedTestRecord, TestRecord } from '../lib/api.js'

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const { data: run, isLoading, error } = useRun(runId ?? '')

  if (isLoading) return <Skeleton />

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 font-mono text-sm text-tn-muted">
          {error.name === 'NotFoundError' ? 'Run not found.' : error.message}
        </p>
        <Link
          to="/"
          className="font-display text-xs font-semibold uppercase tracking-widest text-tn-blue transition-colors hover:text-tn-purple"
        >
          ← All runs
        </Link>
      </div>
    )
  }

  if (!run) return null

  const annotatedRun: AnnotatedRunWithTests = { ...run, tests: annotateRetriedTests(run.tests) }
  const suites = buildSuiteTree(annotatedRun.tests)

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-2 font-mono text-xs text-tn-muted">
        <Link to="/" className="transition-colors hover:text-tn-blue">
          Runs
        </Link>
        <span>/</span>
        <span className="text-tn-fg">{run.project}</span>
      </nav>

      {/* Run card with progress bar */}
      <RunHeader run={annotatedRun} />
      <RunStats tests={annotatedRun.tests} />

      {/* Suite tree */}
      {annotatedRun.tests.length === 0 ? (
        <p className="py-8 text-center font-mono text-sm text-tn-muted">
          No test results uploaded yet.
        </p>
      ) : (
        <div className="space-y-3">
          {[...suites.entries()].map(([name, node]) => (
            <SuiteGroup key={name} runId={run.runId} name={name} node={node} />
          ))}
        </div>
      )}
    </div>
  )
}

function annotateRetriedTests(tests: TestRecord[]): AnnotatedTestRecord[] {
  const byIdentity = new Map<string, TestRecord[]>()
  for (const test of tests) {
    const key = test.titlePath.join('\0')
    const group = byIdentity.get(key) ?? []
    group.push(test)
    byIdentity.set(key, group)
  }

  const retriedIds = new Set<string>()
  for (const group of byIdentity.values()) {
    if (group.length <= 1) continue
    const maxRetry = Math.max(...group.map((t) => t.retry))
    const finalAttempt = group.find((t) => t.retry === maxRetry)
    if (finalAttempt?.status === 'passed') {
      for (const t of group) {
        if (t.retry < maxRetry && (t.status === 'failed' || t.status === 'timedOut')) {
          retriedIds.add(t.testId)
        }
      }
    }
  }

  return tests.map((t) => (retriedIds.has(t.testId) ? { ...t, retried: true } : t))
}

function buildSuiteTree(tests: AnnotatedTestRecord[]): Map<string, SuiteTreeNode> {
  const root = new Map<string, SuiteTreeNode>()
  for (const test of tests) {
    const path = test.titlePath.slice(0, -1).filter((p) => p !== '')
    const effectivePath = path.length > 0 ? path : ['Uncategorized']
    insertIntoTree(root, effectivePath, test)
  }
  return root
}

function insertIntoTree(
  map: Map<string, SuiteTreeNode>,
  path: string[],
  test: AnnotatedTestRecord,
) {
  const [head, ...rest] = path
  let node = map.get(head)
  if (!node) {
    node = { children: new Map(), tests: [] }
    map.set(head, node)
  }
  if (rest.length === 0) {
    node.tests.push(test)
  } else {
    insertIntoTree(node.children, rest, test)
  }
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex gap-2">
        <div className="h-4 w-10 rounded bg-tn-panel" />
        <div className="h-4 w-4 rounded bg-tn-panel" />
        <div className="h-4 w-24 rounded bg-tn-panel" />
      </div>
      <div className="h-28 rounded-xl border border-tn-border bg-tn-panel" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 rounded-xl border border-tn-border bg-tn-panel" />
      ))}
    </div>
  )
}
