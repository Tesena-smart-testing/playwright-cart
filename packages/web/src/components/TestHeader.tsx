import { Link } from 'react-router-dom'
import { getTestOutcome, type TestRecord } from '../lib/api.js'
import { formatDuration } from '../lib/format.js'
import StatusBadge from './StatusBadge.js'
import TagChip from './TagChip.js'

interface Props {
  test: TestRecord
}

export default function TestHeader({ test }: Props) {
  const suitePath = test.titlePath.slice(0, -1).join(' › ')
  const outcome = getTestOutcome(test)

  const badgeStatus =
    outcome === 'expected-failure'
      ? 'passed'
      : outcome === 'unexpected-pass'
        ? 'failed'
        : test.status

  return (
    <div className="mb-6">
      {suitePath && (
        <div className="mb-1 font-mono text-xs tracking-wide text-tn-muted">{suitePath}</div>
      )}
      <div className="mb-3 flex items-start gap-3">
        <h1 className="flex-1 font-display text-2xl font-bold text-tn-fg">{test.title}</h1>
        <StatusBadge status={badgeStatus} />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-tn-highlight px-3 py-1 font-mono text-xs text-tn-muted">
          {formatDuration(test.duration)}
        </span>
        {outcome === 'expected-failure' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tn-purple/10 px-3 py-1 font-mono text-xs text-tn-purple">
            expected failure
          </span>
        )}
        {outcome === 'unexpected-pass' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tn-red/10 px-3 py-1 font-mono text-xs text-tn-red">
            unexpected pass
          </span>
        )}
        {test.retry > 0 && (
          <Link
            to={`/charts/test-reliability?testId=${encodeURIComponent(test.testId)}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-tn-yellow/10 px-3 py-1 font-mono text-xs text-tn-yellow transition-colors hover:bg-tn-yellow/20"
            title="View reliability history"
          >
            Retry #{test.retry}
          </Link>
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
