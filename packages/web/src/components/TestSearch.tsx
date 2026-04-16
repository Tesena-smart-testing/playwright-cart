import { useState } from 'react'
import { useTestSearch } from '../hooks/useTestSearch.js'
import type { TestSearchResult } from '../lib/api.js'

interface Props {
  project?: string
  onSelect: (test: TestSearchResult) => void
}

export default function TestSearch({ project, onSelect }: Props) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const { data: results = [] } = useTestSearch(q, project)

  function handleSelect(test: TestSearchResult) {
    setQ(test.title)
    setOpen(false)
    onSelect(test)
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search by test title…"
        className="w-full rounded-lg border border-tn-border bg-tn-panel px-4 py-2.5 font-mono text-sm text-tn-fg placeholder:text-tn-muted focus:border-tn-blue focus:outline-none"
      />

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 overflow-hidden rounded-b-lg border border-t-0 border-tn-border bg-tn-panel shadow-xl">
          {results.map((test) => (
            <button
              key={test.testId}
              type="button"
              onMouseDown={() => handleSelect(test)}
              className="flex w-full flex-col px-4 py-2.5 text-left transition-colors hover:bg-tn-highlight"
            >
              <span className="font-mono text-sm text-tn-fg">{test.titlePath.join(' › ')}</span>
              <span className="font-mono text-xs text-tn-muted">{test.locationFile}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
