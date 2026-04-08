import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatExpiry } from './format.js'

// Pin "now" to a fixed point for deterministic tests.
// All startedAt values are expressed relative to this anchor.
const NOW = new Date('2026-04-08T12:00:00.000Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

// Helper: ISO string for a run that started `daysAgo` days before NOW
function startedAt(daysAgo: number, hoursAgo = 0, minutesAgo = 0): string {
  return new Date(
    NOW - daysAgo * 86_400_000 - hoursAgo * 3_600_000 - minutesAgo * 60_000,
  ).toISOString()
}

describe('formatExpiry', () => {
  describe('label — days granularity (≥ 24h left)', () => {
    it('shows days when time left is well over a day', () => {
      // Started 2d ago, retention 90d → 88d left
      expect(formatExpiry(startedAt(2), 90).label).toBe('88d')
    })

    it('shows exactly 1d when exactly 24h remain', () => {
      // Started 89d ago, retention 90d → exactly 1d left
      expect(formatExpiry(startedAt(89), 90).label).toBe('1d')
    })
  })

  describe('label — hours granularity (≥ 1h but < 24h left)', () => {
    it('shows hours when less than a day remains', () => {
      // Started 89d 6h ago, retention 90d → 18h left
      expect(formatExpiry(startedAt(89, 6), 90).label).toBe('18h')
    })

    it('shows 1h when exactly 1h remains', () => {
      // Started 89d 23h ago → 1h left
      expect(formatExpiry(startedAt(89, 23), 90).label).toBe('1h')
    })
  })

  describe('label — minutes granularity (< 1h left)', () => {
    it('shows minutes when less than an hour remains', () => {
      // Started 89d 23h 26m ago → 34m left
      expect(formatExpiry(startedAt(89, 23, 26), 90).label).toBe('34m')
    })

    it('shows "< 1m" when less than 1 minute remains', () => {
      // Started 89d 23h 59m 30s ago → 30s left
      const iso = new Date(
        NOW - (89 * 86_400_000 + 23 * 3_600_000 + 59 * 60_000 + 30_000),
      ).toISOString()
      expect(formatExpiry(iso, 90).label).toBe('< 1m')
    })

    it('shows "< 1m" when run is already past expiry', () => {
      // Started 91d ago with 90d retention — overdue by 1d
      expect(formatExpiry(startedAt(91), 90).label).toBe('< 1m')
    })
  })

  describe('tier — proportional coloring', () => {
    it('returns green when more than 25% of retention period remains', () => {
      // 88d left out of 90 → 97.8% → green
      expect(formatExpiry(startedAt(2), 90).tier).toBe('green')
    })

    it('returns yellow at exactly 25% boundary', () => {
      // 22.5d left out of 90 → exactly 25% → yellow (not > 25%)
      expect(formatExpiry(startedAt(67, 12), 90).tier).toBe('yellow')
    })

    it('returns yellow in the 10–25% band', () => {
      // 20d left out of 90 → 22.2% → yellow
      expect(formatExpiry(startedAt(70), 90).tier).toBe('yellow')
    })

    it('returns red below 10%', () => {
      // 8d left out of 90 → 8.9% → red
      expect(formatExpiry(startedAt(82), 90).tier).toBe('red')
    })

    it('returns red when past expiry', () => {
      expect(formatExpiry(startedAt(91), 90).tier).toBe('red')
    })

    it('scales thresholds with retention period (30d)', () => {
      // 30d retention: warn at 7.5d, urgent at 3d
      // 20d left → 66.7% → green
      expect(formatExpiry(startedAt(10), 30).tier).toBe('green')
      // 6d left → 20% → yellow
      expect(formatExpiry(startedAt(24), 30).tier).toBe('yellow')
      // 2d left → 6.7% → red
      expect(formatExpiry(startedAt(28), 30).tier).toBe('red')
    })
  })
})
