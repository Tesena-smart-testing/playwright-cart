export const CHART_CONFIGS = [
  {
    id: 'pass-rate',
    label: 'Pass Rate',
    description: '% of tests passing per bucket',
    colorClass: 'text-tn-green',
    colorHex: 'var(--color-tn-green)',
    bgClass: 'bg-tn-green/15',
    path: '/charts/pass-rate',
  },
  {
    id: 'failures',
    label: 'Failures',
    description: 'Failure count per bucket',
    colorClass: 'text-tn-red',
    colorHex: 'var(--color-tn-red)',
    bgClass: 'bg-tn-red/15',
    path: '/charts/failures',
  },
  {
    id: 'flaky',
    label: 'Flaky Tests',
    description: 'Flaky test count per bucket',
    colorClass: 'text-tn-yellow',
    colorHex: 'var(--color-tn-yellow)',
    bgClass: 'bg-tn-yellow/15',
    path: '/charts/flaky',
  },
  {
    id: 'duration',
    label: 'Avg Duration',
    description: 'Average test duration per bucket',
    colorClass: 'text-tn-blue',
    colorHex: 'var(--color-tn-blue)',
    bgClass: 'bg-tn-blue/15',
    path: '/charts/duration',
  },
  {
    id: 'total-tests',
    label: 'Total Tests',
    description: 'Total tests executed per bucket',
    colorClass: 'text-tn-purple',
    colorHex: 'var(--color-tn-purple)',
    bgClass: 'bg-tn-purple/15',
    path: '/charts/total-tests',
  },
  {
    id: 'test-reliability',
    label: 'Test Reliability',
    description: 'Per-test pass/fail history',
    colorClass: 'text-tn-muted',
    colorHex: 'var(--color-tn-muted)',
    bgClass: 'bg-tn-highlight',
    path: '/charts/test-reliability',
  },
] as const

export type ChartId = (typeof CHART_CONFIGS)[number]['id']

export const DEFAULT_ORDER: ChartId[] = CHART_CONFIGS.map((c) => c.id)

export function getChartConfig(id: ChartId) {
  return CHART_CONFIGS.find((c) => c.id === id) as (typeof CHART_CONFIGS)[number]
}
