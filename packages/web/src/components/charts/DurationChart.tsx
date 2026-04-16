import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TimelineBucket } from '../../lib/api.js'

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

interface Props {
  data: TimelineBucket[]
  height?: number
}

export default function DurationChart({ data, height = 240 }: Props) {
  const chartData = data.map((b) => ({
    key: b.key,
    avg: b.avgDurationMs,
    p95: b.p95DurationMs,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-tn-border)" vertical={false} />
        <XAxis
          dataKey="key"
          tick={{ fill: 'var(--color-tn-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => v.slice(0, 10)}
        />
        <YAxis
          tick={{ fill: 'var(--color-tn-muted)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtMs}
          width={56}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--color-tn-panel)',
            border: '1px solid var(--color-tn-border)',
            borderRadius: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
          }}
          labelFormatter={(v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : String(v))}
          formatter={(v: unknown, name: unknown) => [
            fmtMs(typeof v === 'number' ? v : 0),
            name === 'avg' ? 'Avg' : 'p95',
          ]}
          cursor={{ fill: 'var(--color-tn-highlight)' }}
        />
        <Legend
          wrapperStyle={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}
          formatter={(v) => (v === 'avg' ? 'Avg' : 'p95')}
        />
        <Bar dataKey="avg" fill="var(--color-tn-blue)" radius={[2, 2, 0, 0]} maxBarSize={40} />
        <Bar
          dataKey="p95"
          fill="color-mix(in srgb, var(--color-tn-blue) 40%, transparent)"
          radius={[2, 2, 0, 0]}
          maxBarSize={40}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
