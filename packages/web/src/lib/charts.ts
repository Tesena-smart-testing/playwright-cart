export const CHART_CONFIGS = [
  {
    id: 'pass-rate',
    label: 'Pass Rate',
    description: 'Percentage of automated tests that passed successfully. Higher is better.',
    deltaTooltip:
      'Change in pass rate vs. the previous day (based on the last 30 days). Green = improvement.',
    colorClass: 'text-tn-green',
    colorHex: 'var(--color-tn-green)',
    bgClass: 'bg-tn-green/15',
    path: '/charts/pass-rate',
  },
  {
    id: 'failures',
    label: 'Failures',
    description: 'Number of tests that failed in each period. Lower is better.',
    deltaTooltip:
      'Change in number of failures vs. the previous day (based on the last 30 days). Green = fewer failures.',
    colorClass: 'text-tn-red',
    colorHex: 'var(--color-tn-red)',
    bgClass: 'bg-tn-red/15',
    path: '/charts/failures',
  },
  {
    id: 'flaky',
    label: 'Flaky Tests',
    description:
      'Tests that passed sometimes and failed other times — unreliable results that need attention. Lower is better.',
    deltaTooltip:
      'Change in unreliable tests vs. the previous day (based on the last 30 days). Green = improvement.',
    colorClass: 'text-tn-yellow',
    colorHex: 'var(--color-tn-yellow)',
    bgClass: 'bg-tn-yellow/15',
    path: '/charts/flaky',
  },
  {
    id: 'duration',
    label: 'Avg Duration',
    description: 'How long all tests take to run on average. Lower means faster feedback.',
    deltaTooltip:
      'Change in average test run time vs. the previous day (based on the last 30 days). Green = faster.',
    colorClass: 'text-tn-blue',
    colorHex: 'var(--color-tn-blue)',
    bgClass: 'bg-tn-blue/15',
    path: '/charts/duration',
  },
  {
    id: 'total-tests',
    label: 'Total Tests',
    description: 'Total number of automated tests executed in each period.',
    deltaTooltip:
      'Change in total tests run vs. the previous day (based on the last 30 days). Green = more tests run.',
    colorClass: 'text-tn-purple',
    colorHex: 'var(--color-tn-purple)',
    bgClass: 'bg-tn-purple/15',
    path: '/charts/total-tests',
  },
  {
    id: 'test-reliability',
    label: 'Test Reliability',
    description: 'Historical pass/fail record for individual tests over time.',
    deltaTooltip: '',
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
