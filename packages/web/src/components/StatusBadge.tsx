import type { RunStatus, TestStatus } from '../lib/api.js'

type Status = RunStatus | TestStatus

const STYLES: Record<Status, string> = {
  passed:      'bg-tn-green/20 text-tn-green',
  failed:      'bg-tn-red/20 text-tn-red',
  running:     'bg-tn-yellow/20 text-tn-yellow',
  timedOut:    'bg-tn-yellow/20 text-tn-yellow',
  interrupted: 'bg-tn-muted/20 text-tn-muted',
  skipped:     'bg-tn-muted/20 text-tn-muted',
}

const DOTS: Record<Status, string> = {
  passed:      '●',
  failed:      '●',
  running:     '◌',
  timedOut:    '●',
  interrupted: '●',
  skipped:     '○',
}

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      <span>{DOTS[status]}</span>
      {status}
    </span>
  )
}
