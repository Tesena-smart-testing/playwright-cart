import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { RunAiSummaryTab } from '../components/AiSummaryTab.js'
import RunHeader from '../components/RunHeader.js'
import RunStats from '../components/RunStats.js'
import SuiteGroup, { type SuiteTreeNode } from '../components/SuiteGroup.js'
import TagFilter from '../components/TagFilter.js'
import { useLlmSettings } from '../hooks/useLlmSettings.js'
import { useRun } from '../hooks/useRun.js'
import type { AnnotatedRunWithTests, AnnotatedTestRecord } from '../lib/api.js'
import { annotateRetriedTests } from '../lib/retries.js'
import { collectUniqueTags, matchesAllTags } from '../lib/tags.js'

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const [params, setParams] = useSearchParams()
  const { data: run, isLoading, error } = useRun(runId ?? '')
  const { data: llmSettings } = useLlmSettings()
  const llmEnabled = llmSettings?.enabled ?? false
  const [activeTab, setActiveTab] = useState<'tests' | 'summary'>('tests')

  if (isLoading) return <Skeleton />

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 font-mono text-sm text-tn-muted">
          {error.name === 'NotFoundError' ? 'Run not found.' : error.message}
        </p>
        <Link
          to="/"
          className={[
            'font-display text-xs font-semibold uppercase tracking-widest',
            'text-tn-blue transition-colors hover:text-tn-purple',
          ].join(' ')}
        >
          ← All runs
        </Link>
      </div>
    )
  }

  if (!run) return null

  const annotatedRun: AnnotatedRunWithTests = { ...run, tests: annotateRetriedTests(run.tests) }
  const selectedTags = params.getAll('tag').sort()
  const filteredTests = annotatedRun.tests.filter((test) => matchesAllTags(test.tags, selectedTags))
  const suites = buildSuiteTree(filteredTests)
  const defaultOpenPaths = buildDefaultOpenPaths(filteredTests)
  const availableTags = collectUniqueTags(annotatedRun.tests.map((test) => test.tags))

  function setSelectedTags(tags: string[]) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('tag')
      for (const tag of tags) next.append('tag', tag)
      return next
    })
  }

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
      <div className="mb-6">
        <TagFilter
          tags={availableTags}
          selectedTags={selectedTags}
          label="Suite and test tags"
          onChange={setSelectedTags}
        />
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-tn-border mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('tests')}
          className={[
            'px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest',
            activeTab === 'tests'
              ? 'border-b-2 border-tn-blue text-tn-blue'
              : 'text-tn-muted hover:text-tn-fg',
          ].join(' ')}
        >
          Tests
        </button>
        {llmEnabled && (
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={[
              'px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest',
              activeTab === 'summary'
                ? 'border-b-2 border-tn-blue text-tn-blue'
                : 'text-tn-muted hover:text-tn-fg',
            ].join(' ')}
          >
            ✦ AI Summary
          </button>
        )}
      </div>

      {/* AI Summary tab */}
      {activeTab === 'summary' && llmEnabled && run && <RunAiSummaryTab runId={run.runId} />}

      {/* Suite tree */}
      {activeTab === 'tests' &&
        (filteredTests.length === 0 ? (
          <p className="py-8 text-center font-mono text-sm text-tn-muted">
            {annotatedRun.tests.length === 0
              ? 'No test results uploaded yet.'
              : 'No suites or tests match current tag filters.'}
          </p>
        ) : (
          <div className="space-y-3">
            {[...suites.entries()].map(([name, node]) => (
              <SuiteGroup
                key={name}
                runId={run.runId}
                name={name}
                node={node}
                path={[name]}
                defaultOpenPaths={defaultOpenPaths}
                selectedTags={selectedTags}
              />
            ))}
          </div>
        ))}
    </div>
  )
}

export function buildSuiteTree(tests: AnnotatedTestRecord[]): Map<string, SuiteTreeNode> {
  const root = new Map<string, SuiteTreeNode>()
  for (const test of tests) {
    const effectivePath = getSuitePath(test)
    insertIntoTree(root, effectivePath, test)
  }
  return root
}

export function buildDefaultOpenPaths(tests: AnnotatedTestRecord[]): Set<string> {
  const openPaths = new Set<string>()

  for (const test of tests) {
    if (!isUltimatelyFailed(test)) continue

    const path = getSuitePath(test)
    for (let i = 1; i <= path.length; i += 1) {
      openPaths.add(getSuitePathKey(path.slice(0, i)))
    }
  }

  return openPaths
}

function getSuitePath(test: AnnotatedTestRecord): string[] {
  const path = test.titlePath.slice(0, -1).filter((part) => part !== '')
  return path.length > 0 ? path : ['Uncategorized']
}

function isUltimatelyFailed(test: AnnotatedTestRecord): boolean {
  return !test.retried && (test.status === 'failed' || test.status === 'timedOut')
}

export function getSuitePathKey(path: string[]): string {
  return path.join('\0')
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
