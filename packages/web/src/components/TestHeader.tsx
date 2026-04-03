import type { TestRecord } from '../lib/api.js'
import { formatDuration } from '../lib/format.js'
import StatusBadge from './StatusBadge.js'

interface Props {
  test: TestRecord
}

export default function TestHeader({ test }: Props) {
  const suitePath = test.titlePath.slice(0, -1).join(' › ')

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-start gap-3">
        <div className="flex-1">
          {suitePath && (
            <div className="mb-1 text-xs text-tn-muted">{suitePath}</div>
          )}
          <h1 className="text-xl font-bold text-tn-fg">{test.title}</h1>
        </div>
        <StatusBadge status={test.status} />
      </div>
      <div className="flex gap-4 text-sm text-tn-muted">
        <span>Duration: {formatDuration(test.duration)}</span>
        {test.retry > 0 && (
          <span className="text-tn-yellow">Retry #{test.retry}</span>
        )}
        <span>
          {test.location.file}:{test.location.line}
        </span>
      </div>
    </div>
  )
}
