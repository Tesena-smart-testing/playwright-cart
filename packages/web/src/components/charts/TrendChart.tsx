import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TimelineBucket } from '../../lib/api.js'

interface Props {
  data: TimelineBucket[]
  color: string
  getValue: (bucket: TimelineBucket) => number
  formatValue?: (v: number) => string
  label: string
  height?: number
}

export default function TrendChart({
  data,
  color,
  getValue,
  formatValue = (v) => String(v),
  label,
  height = 240,
}: Props) {
  const chartData = data.map((b) => ({
    key: b.key,
    startedAt: b.startedAt,
    value: getValue(b),
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
          tickFormatter={formatValue}
          width={48}
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
          formatter={(v: unknown) => [formatValue(typeof v === 'number' ? v : 0), label]}
          cursor={{ fill: 'var(--color-tn-highlight)' }}
        />
        <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  )
}
