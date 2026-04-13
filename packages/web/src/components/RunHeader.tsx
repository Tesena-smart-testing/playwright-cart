import type { AnnotatedRunWithTests, AnnotatedTestRecord } from '../lib/api.js'
import ExternalLink from './ExternalLink.js'
import StatusBadge from './StatusBadge.js'
import TagChip from './TagChip.js'

interface Props {
  run: AnnotatedRunWithTests
}

export default function RunHeader({ run }: Props) {
  return (
    <div className="mb-6 rounded-xl border border-tn-border bg-tn-panel p-5">
      {/* Title row */}
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-tn-fg">{run.project}</h1>
            <StatusBadge status={run.status} />
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-tn-muted">
            {run.branch && <span className="text-tn-blue">{run.branch}</span>}
            {run.commitSha && (
              <code className="rounded bg-tn-highlight px-1.5 py-0.5 text-tn-muted">
                {run.commitSha.slice(0, 7)}
              </code>
            )}
            <span>{new Date(run.startedAt).toLocaleString()}</span>
          </div>
          {run.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {run.tags.map((tag) => (
                <TagChip key={tag} tag={tag} />
              ))}
            </div>
          )}
        </div>
        {run.reportUrl && (
          <ExternalLink
            href={run.reportUrl}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-tn-blue px-4 py-2 font-display text-xs font-semibold tracking-wide text-tn-blue transition-colors hover:bg-tn-blue/10"
          >
            Open Report
          </ExternalLink>
        )}
      </div>

      {/* Progress bar + stats */}
      <PassRateBar tests={run.tests} />
    </div>
  )
}

function PassRateBar({ tests }: { tests: AnnotatedTestRecord[] }) {
  if (tests.length === 0) return null

  const finalTests = tests.filter((t) => !t.retried)
  const retriedTests = new Set(tests.filter((t) => t.retried).map(getTestIdentityKey))
  const passed = finalTests.filter(
    (t) => t.status === 'passed' && !retriedTests.has(getTestIdentityKey(t)),
  ).length
  const failed = finalTests.filter((t) => t.status === 'failed').length
  const timedOut = finalTests.filter((t) => t.status === 'timedOut').length
  const flaky = finalTests.filter(
    (t) => t.status === 'passed' && retriedTests.has(getTestIdentityKey(t)),
  ).length
  const skipped = finalTests.filter((t) => t.status === 'skipped').length
  const total = finalTests.length

  if (total === 0) return null

  const passedPct = (passed / total) * 100
  const failedPct = ((failed + timedOut) / total) * 100
  const flakyPct = (flaky / total) * 100

  return (
    <div className="mt-3 space-y-2">
      {/* Progress bar */}
      <div className="flex h-1.5 overflow-hidden rounded-full bg-tn-highlight">
        <div
          className="bg-tn-green transition-all duration-500"
          style={{ width: `${passedPct}%` }}
        />
        <div className="bg-tn-red transition-all duration-500" style={{ width: `${failedPct}%` }} />
        <div
          className="bg-tn-yellow transition-all duration-500"
          style={{ width: `${flakyPct}%` }}
        />
      </div>

      {/* Stat pills */}
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
        <span className="text-tn-green">{passed} passed</span>
        {flaky > 0 && <span className="text-tn-yellow">{flaky} flaky</span>}
        {failed > 0 && <span className="text-tn-red">{failed} failed</span>}
        {timedOut > 0 && <span className="text-tn-yellow">{timedOut} timed out</span>}
        {skipped > 0 && <span className="text-tn-muted">{skipped} skipped</span>}
        <span className="text-tn-muted">/ {total} total</span>
      </div>
    </div>
  )
}

function getTestIdentityKey(test: Pick<AnnotatedTestRecord, 'titlePath'>) {
  return test.titlePath.join('\0')
}
