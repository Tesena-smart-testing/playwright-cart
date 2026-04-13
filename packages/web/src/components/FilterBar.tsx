import { useSearchParams } from 'react-router-dom'
import type { RunRecord, RunStatus } from '../lib/api.js'
import TagFilter from './TagFilter.js'

const ALL_STATUSES: RunStatus[] = ['running', 'passed', 'failed', 'interrupted', 'timedOut']

interface Props {
  projects: string[]
  branches: string[]
  tags: string[]
}

export function FilterBar({ projects, branches, tags }: Props) {
  const [params, setParams] = useSearchParams()

  const project = params.get('project') ?? ''
  const branch = params.get('branch') ?? ''
  const status = params.get('status') ?? ''
  const selectedTags = params.getAll('tag').sort()

  function setParam(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  function setTags(nextTags: string[]) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('tag')
      for (const tag of nextTags) next.append('tag', tag)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <FilterSelect label="Project" value={project} onChange={(v) => setParam('project', v)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </FilterSelect>
        <span className="text-tn-border select-none">|</span>
        <FilterSelect label="Branch" value={branch} onChange={(v) => setParam('branch', v)}>
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </FilterSelect>
        <span className="text-tn-border select-none">|</span>
        <FilterSelect label="Status" value={status} onChange={(v) => setParam('status', v)}>
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </FilterSelect>
      </div>
      <TagFilter tags={tags} selectedTags={selectedTags} label="Run tags" onChange={setTags} />
    </div>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="cursor-pointer bg-transparent px-2 py-1 font-display text-xs text-tn-muted outline-none transition-colors hover:text-tn-fg focus:text-tn-fg"
    >
      {children}
    </select>
  )
}

export function applyFilters(runs: RunRecord[], params: URLSearchParams): RunRecord[] {
  const project = params.get('project')
  const branch = params.get('branch')
  const status = params.get('status') as RunStatus | null
  const tags = params.getAll('tag')
  return runs.filter((r) => {
    if (project && r.project !== project) return false
    if (branch && r.branch !== branch) return false
    if (status && r.status !== status) return false
    if (tags.length > 0 && !tags.every((tag) => r.tags.includes(tag))) return false
    return true
  })
}
