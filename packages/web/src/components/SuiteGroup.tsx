import { useState } from 'react'
import { Link } from 'react-router-dom'
import { type AnnotatedTestRecord, getTestOutcome, type TestStatus } from '../lib/api.js'
import { formatDuration } from '../lib/format.js'
import { collectUniqueTags, getVisibleTags } from '../lib/tags.js'
import { getSuitePathKey } from '../pages/RunDetailPage.js'
import TagChip from './TagChip.js'

export interface SuiteTreeNode {
  children: Map<string, SuiteTreeNode>
  tests: AnnotatedTestRecord[]
}

interface Props {
  runId: string
  name: string
  node: SuiteTreeNode
  path: string[]
  defaultOpenPaths: ReadonlySet<string>
  selectedTags?: string[]
  depth?: number
}

const DEPTH_PADDING = ['pl-4', 'pl-8', 'pl-12', 'pl-16']

function getPadding(depth: number) {
  return DEPTH_PADDING[Math.min(depth, DEPTH_PADDING.length - 1)]
}

export default function SuiteGroup({
  runId,
  name,
  node,
  path,
  defaultOpenPaths,
  selectedTags = [],
  depth = 0,
}: Props) {
  const [open, setOpen] = useState(() => defaultOpenPaths.has(getSuitePathKey(path)))
  const { total, failed, flaky, skipped } = countTests(node)
  const visibleSuiteTags = getVisibleTags(collectNodeTags(node), selectedTags)

  return (
    <div className="overflow-hidden rounded-xl border border-tn-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-3 bg-tn-panel px-4 py-3 text-left transition-colors hover:bg-tn-highlight/60 ${getPadding(depth)}`}
      >
        <span
          className="font-mono text-sm text-tn-muted transition-transform duration-200"
          style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ›
        </span>
        <div className="min-w-0 flex-1">
          <span className="font-display font-semibold text-tn-fg">{name}</span>
          {visibleSuiteTags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {visibleSuiteTags.map((tag) => (
                <TagChip key={tag} tag={tag} small />
              ))}
            </div>
          )}
        </div>
        <span className="ml-auto">
          {failed > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-tn-red/10 px-2 py-0.5 font-display text-xs font-semibold text-tn-red">
              {failed} failed
            </span>
          ) : flaky > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-tn-yellow/10 px-2 py-0.5 font-display text-xs font-semibold text-tn-yellow">
              {flaky} flaky
            </span>
          ) : skipped === total ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-tn-muted/10 px-2 py-0.5 font-display text-xs font-semibold text-tn-muted">
              {skipped} skipped
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-tn-green/10 px-2 py-0.5 font-display text-xs font-semibold text-tn-green">
              {total - skipped} passed
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="bg-tn-bg/50">
          {/* Direct tests at this level */}
          {node.tests.length > 0 && (
            <div className="divide-y divide-tn-border">
              {node.tests.map((test) => (
                <Link
                  key={test.testId}
                  to={`/runs/${runId}/tests/${test.testId}`}
                  className={`flex items-center gap-3 py-2.5 pr-4 transition-colors hover:bg-tn-highlight/40 ${getPadding(depth + 1)}`}
                >
                  <TestStatusIcon
                    status={test.status}
                    retried={test.retried}
                    annotations={test.annotations}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-tn-fg">{test.title}</span>
                    {getVisibleTags(test.tags, selectedTags).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {getVisibleTags(test.tags, selectedTags).map((tag) => (
                          <TagChip key={tag} tag={tag} small />
                        ))}
                      </div>
                    )}
                  </div>
                  {test.retried && (
                    <span className="rounded-full bg-tn-yellow/10 px-1.5 py-0.5 font-mono text-xs text-tn-yellow">
                      retried
                    </span>
                  )}
                  {!test.retried &&
                    (getTestOutcome(test) === 'expected-failure' ? (
                      <span className="rounded-full bg-tn-purple/10 px-1.5 py-0.5 font-mono text-xs text-tn-purple">
                        xfail
                      </span>
                    ) : getTestOutcome(test) === 'unexpected-pass' ? (
                      <span className="rounded-full bg-tn-orange/10 px-1.5 py-0.5 font-mono text-xs text-tn-orange">
                        xpass
                      </span>
                    ) : null)}
                  <span className="font-mono text-xs text-tn-muted">
                    {formatDuration(test.duration)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* Nested describe blocks */}
          {node.children.size > 0 && (
            <div className="divide-y divide-tn-border border-t border-tn-border">
              {[...node.children.entries()].map(([childName, childNode]) => (
                <SuiteGroup
                  key={childName}
                  runId={runId}
                  name={childName}
                  node={childNode}
                  path={[...path, childName]}
                  defaultOpenPaths={defaultOpenPaths}
                  selectedTags={selectedTags}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function collectNodeTags(node: SuiteTreeNode): string[] {
  const nestedTags = [...node.children.values()].map((child) => collectNodeTags(child))
  return collectUniqueTags([node.tests.flatMap((test) => test.tags), ...nestedTags])
}

function countTests(node: SuiteTreeNode): {
  total: number
  failed: number
  flaky: number
  skipped: number
} {
  const direct = node.tests.filter((t) => !t.retried)
  const result = {
    total: direct.length,
    failed: direct.filter(
      (t) => t.status === 'failed' || t.status === 'timedOut' || t.status === 'interrupted',
    ).length,
    flaky: node.tests.filter((t) => t.retried).length,
    skipped: direct.filter((t) => t.status === 'skipped').length,
  }
  for (const child of node.children.values()) {
    const sub = countTests(child)
    result.total += sub.total
    result.failed += sub.failed
    result.flaky += sub.flaky
    result.skipped += sub.skipped
  }
  return result
}

const STATUS_ICON: Record<TestStatus, { icon: string; className: string }> = {
  passed: { icon: '✓', className: 'text-tn-green' },
  failed: { icon: '✗', className: 'text-tn-red' },
  timedOut: { icon: '◷', className: 'text-tn-yellow' },
  skipped: { icon: '○', className: 'text-tn-muted' },
  interrupted: { icon: '!', className: 'text-tn-muted' },
}

function TestStatusIcon({
  status,
  retried,
  annotations,
}: {
  status: TestStatus
  retried?: boolean
  annotations: AnnotatedTestRecord['annotations']
}) {
  if (retried) return <span className="font-mono text-sm leading-none text-tn-yellow">↻</span>
  const outcome = getTestOutcome({ status, annotations })
  if (outcome === 'expected-failure') {
    return <span className="font-mono text-sm leading-none text-tn-green">✓</span>
  }
  if (outcome === 'unexpected-pass') {
    return <span className="font-mono text-sm leading-none text-tn-red">✗</span>
  }
  const { icon, className } = STATUS_ICON[status]
  return <span className={`font-mono text-sm leading-none ${className}`}>{icon}</span>
}
