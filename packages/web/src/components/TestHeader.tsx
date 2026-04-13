import type { TestRecord } from '../lib/api.js'
import { formatDuration } from '../lib/format.js'
import StatusBadge from './StatusBadge.js'
import TagChip from './TagChip.js'

interface Props {
  test: TestRecord
}

export default function TestHeader({ test }: Props) {
  const suitePath = test.titlePath.slice(0, -1).join(' › ')

  return (
    <div className="mb-6">
      {suitePath && (
        <div className="mb-1 font-mono text-xs tracking-wide text-tn-muted">{suitePath}</div>
      )}
      <div className="mb-3 flex items-start gap-3">
        <h1 className="flex-1 font-display text-2xl font-bold text-tn-fg">{test.title}</h1>
        <StatusBadge status={test.status} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-tn-highlight px-3 py-1 font-mono text-xs text-tn-muted">
          {formatDuration(test.duration)}
        </span>
        {test.retry > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tn-yellow/10 px-3 py-1 font-mono text-xs text-tn-yellow">
            Retry #{test.retry}
          </span>
        )}
        {test.tags.map((tag) => (
          <TagChip key={tag} tag={tag} />
        ))}
        <span className="font-mono text-xs text-tn-muted">
          {test.location.file}:{test.location.line}
        </span>
      </div>
    </div>
  )
}
