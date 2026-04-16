import type { RunsMeta } from '../../lib/api.js'

export interface FilterValue {
  project?: string
  branch?: string
  tags?: string[]
}

interface Props {
  value: FilterValue
  onChange: (v: FilterValue) => void
  meta: RunsMeta
  label?: string
}

export default function ChartFilterBar({ value, onChange, meta, label = 'Filters' }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-tn-border bg-tn-panel px-3 py-2">
      <span className="font-mono text-xs uppercase tracking-widest text-tn-muted">{label}</span>

      <select
        value={value.project ?? ''}
        onChange={(e) => onChange({ ...value, project: e.target.value || undefined })}
        className="rounded border border-tn-border bg-tn-highlight px-2 py-1 font-mono text-xs text-tn-fg"
      >
        <option value="">Project: all</option>
        {meta.projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        value={value.branch ?? ''}
        onChange={(e) => onChange({ ...value, branch: e.target.value || undefined })}
        className="rounded border border-tn-border bg-tn-highlight px-2 py-1 font-mono text-xs text-tn-fg"
      >
        <option value="">Branch: all</option>
        {meta.branches.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </div>
  )
}
