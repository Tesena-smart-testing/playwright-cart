import type { RunRecord } from '../lib/api.js'

interface Props {
  runs: RunRecord[]
}

export default function StatsBar({ runs }: Props) {
  const completed = runs.filter((r) => r.status !== 'running')
  const passed = runs.filter((r) => r.status === 'passed').length
  const failed = runs.filter((r) => r.status === 'failed').length
  const passRate = completed.length > 0 ? Math.round((passed / completed.length) * 100) : 0

  return (
    <div className="mb-6 flex items-baseline gap-0 divide-x divide-tn-border">
      <Stat value={runs.length} label="runs" containerClassName="pr-6" className="text-tn-fg" />
      <Stat
        value={`${passRate}%`}
        label="pass rate"
        containerClassName="px-6"
        className="text-tn-green"
      />
      <Stat
        value={failed}
        label="failed"
        containerClassName="pl-6"
        className={failed > 0 ? 'text-tn-red' : 'text-tn-muted'}
      />
    </div>
  )
}

function Stat({
  value,
  label,
  className,
  containerClassName,
}: {
  value: string | number
  label: string
  className?: string
  containerClassName?: string
}) {
  return (
    <div className={`flex items-baseline gap-2 ${containerClassName ?? ''}`}>
      <span className={`font-display text-3xl font-bold tabular-nums leading-none ${className}`}>
        {value}
      </span>
      <span className="text-xs text-tn-muted">{label}</span>
    </div>
  )
}
