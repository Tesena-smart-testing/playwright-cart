import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteRun, deleteRunsBatch } from '../lib/api.js'
import type { RunRecord } from '../lib/api.js'
import { formatRelativeTime } from '../lib/format.js'
import StatusBadge from './StatusBadge.js'

interface Props {
  runs: RunRecord[]
  isAdmin?: boolean
  onDeleteSuccess?: () => void
}

export default function RunsTable({ runs, isAdmin, onDeleteSuccess }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  if (runs.length === 0) {
    return <p className="py-8 text-center text-tn-muted">No runs match the current filters.</p>
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
    await deleteRunsBatch(Array.from(selected))
    setSelected(new Set())
    onDeleteSuccess?.()
  }

  async function handleDeleteOne(runId: string) {
    if (!window.confirm('Delete this run? This cannot be undone.')) return
    await deleteRun(runId)
    onDeleteSuccess?.()
  }

  const dataHeaders = ['Project / Branch', 'Commit', 'Status', 'When', '']

  return (
    <div>
      {isAdmin && selected.size > 0 && (
        <div className="mb-2 flex items-center gap-3">
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="rounded border border-tn-red px-3 py-1 text-sm text-tn-red transition-colors hover:bg-tn-red hover:text-tn-bg"
          >
            Delete selected ({selected.size})
          </button>
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-tn-border bg-tn-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tn-border bg-tn-bg">
              {isAdmin && (
                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-tn-muted">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                    className="cursor-pointer"
                  />
                </th>
              )}
              {dataHeaders.map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-tn-muted"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-tn-border">
            {runs.map((run) => (
              <tr key={run.runId} className="transition-colors hover:bg-tn-highlight">
                {isAdmin && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(run.runId)}
                      onChange={() => toggleOne(run.runId)}
                      aria-label={`Select run ${run.runId}`}
                      className="cursor-pointer"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="font-medium text-tn-fg">{run.project}</div>
                  {run.branch && <div className="text-xs text-tn-blue">{run.branch}</div>}
                </td>
                <td className="px-4 py-3">
                  {run.commitSha ? (
                    <code className="text-xs text-tn-muted">{run.commitSha.slice(0, 7)}</code>
                  ) : (
                    <span className="text-xs text-tn-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-4 py-3 text-xs text-tn-muted">
                  {formatRelativeTime(run.startedAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      to={`/runs/${run.runId}`}
                      className="text-xs font-medium text-tn-blue transition-colors hover:text-tn-purple"
                    >
                      View →
                    </Link>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteOne(run.runId)}
                        className="text-xs font-medium text-tn-red transition-colors hover:text-tn-fg"
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
