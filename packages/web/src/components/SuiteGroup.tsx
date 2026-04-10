import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { AnnotatedTestRecord, TestStatus } from '../lib/api.js'
import { formatDuration } from '../lib/format.js'

export interface SuiteTreeNode {
  children: Map<string, SuiteTreeNode>
  tests: AnnotatedTestRecord[]
}

interface Props {
  runId: string
  name: string
  node: SuiteTreeNode
  depth?: number
}

const DEPTH_PADDING = ['pl-4', 'pl-8', 'pl-12', 'pl-16']

function getPadding(depth: number) {
  return DEPTH_PADDING[Math.min(depth, DEPTH_PADDING.length - 1)]
}

export default function SuiteGroup({ runId, name, node, depth = 0 }: Props) {
  const [open, setOpen] = useState(true)
  const { total, failed, flaky } = countTests(node)

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
        <span className="font-display font-semibold text-tn-fg">{name}</span>
        <span className="ml-auto">
          {failed > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-tn-red/10 px-2 py-0.5 font-display text-xs font-semibold text-tn-red">
              {failed} failed
            </span>
          ) : flaky > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-tn-yellow/10 px-2 py-0.5 font-display text-xs font-semibold text-tn-yellow">
              {flaky} flaky
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-tn-green/10 px-2 py-0.5 font-display text-xs font-semibold text-tn-green">
              {total} passed
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
                  <TestStatusIcon status={test.status} retried={test.retried} />
                  <span className="flex-1 text-sm text-tn-fg">{test.title}</span>
                  {test.retried && (
                    <span className="rounded-full bg-tn-yellow/10 px-1.5 py-0.5 font-mono text-xs text-tn-yellow">
                      retried
                    </span>
                  )}
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

function countTests(node: SuiteTreeNode): { total: number; failed: number; flaky: number } {
  const direct = node.tests.filter((t) => !t.retried)
  const result = {
    total: direct.length,
    failed: direct.filter((t) => t.status === 'failed' || t.status === 'timedOut').length,
    flaky: node.tests.filter((t) => t.retried).length,
  }
  for (const child of node.children.values()) {
    const sub = countTests(child)
    result.total += sub.total
    result.failed += sub.failed
    result.flaky += sub.flaky
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

function TestStatusIcon({ status, retried }: { status: TestStatus; retried?: boolean }) {
  if (retried) return <span className="font-mono text-sm leading-none text-tn-yellow">↻</span>
  const { icon, className } = STATUS_ICON[status]
  return <span className={`font-mono text-sm leading-none ${className}`}>{icon}</span>
}
