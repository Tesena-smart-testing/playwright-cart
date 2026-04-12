import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { RunRecord } from '../lib/api.js'
import { deleteRun, deleteRunsBatch } from '../lib/api.js'
import { formatExpiry, formatRelativeTime } from '../lib/format.js'
import ExpiryChip from './ExpiryChip.js'
import StatusBadge from './StatusBadge.js'

interface Props {
  runs: RunRecord[]
  isAdmin?: boolean
  retentionDays: number
  onDeleteSuccess?: () => void
}

export default function RunsTable({ runs, isAdmin, retentionDays, onDeleteSuccess }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (runs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-tn-muted">No runs match the current filters.</p>
    )
  }

  const allSelected = runs.length > 0 && runs.every((r) => selected.has(r.runId))

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(runs.map((r) => r.runId)))
    }
  }

  function toggleOne(runId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(runId)) {
        next.delete(runId)
      } else {
        next.add(runId)
      }
      return next
    })
  }

  async function handleDeleteSelected() {
    const count = selected.size
    if (!window.confirm(`Delete ${count} run(s)? This cannot be undone.`)) return
    try {
      await deleteRunsBatch(Array.from(selected))
      setSelected(new Set())
      onDeleteSuccess?.()
    } catch (err) {
      alert(`Delete failed: ${String(err)}`)
    }
  }

  async function handleDeleteOne(runId: string) {
    if (!window.confirm('Delete this run? This cannot be undone.')) return
    try {
      await deleteRun(runId)
      onDeleteSuccess?.()
    } catch (err) {
      alert(`Delete failed: ${String(err)}`)
    }
  }

  const dataHeaders = ['Project / Branch', 'Commit', 'Status', 'When', 'Expires in', '']

  return (
    <div>
      {isAdmin && selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="rounded-full border border-tn-red/50 px-3 py-1 font-display text-xs text-tn-red transition-colors hover:bg-tn-red/10"
          >
            Delete selected ({selected.size})
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-tn-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b-2 border-tn-border backdrop-blur-sm bg-tn-bg/90">
            <tr>
              {isAdmin && (
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="cursor-pointer accent-tn-blue"
                  />
                </th>
              )}
              {dataHeaders.map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-display text-xs font-semibold uppercase tracking-widest text-tn-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-tn-border bg-tn-panel">
            {runs.map((run) => (
              <tr
                key={run.runId}
                className="border-l-2 border-l-transparent transition-all duration-150 hover:border-l-tn-blue hover:bg-tn-highlight/40"
              >
                {isAdmin && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(run.runId)}
                      onChange={() => toggleOne(run.runId)}
                      aria-label={`Select run ${run.runId}`}
                      className="cursor-pointer accent-tn-blue"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="font-display font-semibold text-tn-fg">{run.project}</div>
                  {run.branch && (
                    <div className="mt-0.5 font-mono text-xs text-tn-blue">{run.branch}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {run.commitSha ? (
                    <code className="font-mono text-xs text-tn-muted">
                      {run.commitSha.slice(0, 7)}
                    </code>
                  ) : (
                    <span className="text-xs text-tn-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={run.status} />
                    {(run.flakyCount ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-tn-yellow/15 px-2 py-0.5 font-display text-xs font-semibold text-tn-yellow">
                        ↻ {run.flakyCount} flaky
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-tn-muted">
                  {formatRelativeTime(run.startedAt)}
                </td>
                <td className="px-4 py-3">
                  <ExpiryChip {...formatExpiry(run.startedAt, retentionDays)} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-4">
                    <Link
                      to={`/runs/${run.runId}`}
                      className="font-display text-xs font-semibold tracking-wide text-tn-blue transition-colors hover:text-tn-purple"
                    >
                      View →
                    </Link>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteOne(run.runId)}
                        className="font-display text-xs text-tn-muted transition-colors hover:text-tn-red"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
