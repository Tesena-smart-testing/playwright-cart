# Run Expiry Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display how much time each test run has before it is permanently deleted by the retention job, as a colored "Expires in" chip in a new column on the Runs table.

**Architecture:** Pure frontend change — `GET /api/settings` already returns `data_retention_days` and `GET /api/runs` already returns `startedAt`. We compute the expiry client-side, render a colored chip per row, and poll the runs list every 60 s so deleted runs disappear automatically.

**Tech Stack:** React 19, TanStack Query v5, Tailwind v4 with CSS custom properties (`--tn-*`), Vitest

---

## File Map

| File | Change |
|---|---|
| `packages/web/src/lib/format.ts` | Add `formatExpiry()` |
| `packages/web/src/lib/format.test.ts` | New — unit tests for `formatExpiry` |
| `packages/web/src/hooks/useRuns.ts` | Add `refetchInterval: 60_000` |
| `packages/web/src/hooks/useSettings.ts` | New — react-query wrapper for `fetchSettings` |
| `packages/web/src/components/ExpiryChip.tsx` | New — colored chip component |
| `packages/web/src/components/RunsTable.tsx` | Add `retentionDays` prop + "Expires in" column |
| `packages/web/src/pages/RunsPage.tsx` | Wire `useSettings`, pass `retentionDays` to `RunsTable` |

---

## Task 1: `formatExpiry` utility (TDD)

**Files:**
- Create: `packages/web/src/lib/format.test.ts`
- Modify: `packages/web/src/lib/format.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/web/src/lib/format.test.ts`:

```ts
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
  return new Date(NOW - daysAgo * 86_400_000 - hoursAgo * 3_600_000 - minutesAgo * 60_000).toISOString()
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
      const iso = new Date(NOW - (89 * 86_400_000 + 23 * 3_600_000 + 59 * 60_000 + 30_000)).toISOString()
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
```

- [ ] **Step 2: Run tests — expect failure (function does not exist yet)**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: FAIL — `formatExpiry is not a function` or similar import error.

- [ ] **Step 3: Implement `formatExpiry` in `format.ts`**

Append to `packages/web/src/lib/format.ts`:

```ts
export function formatExpiry(
  startedAt: string,
  retentionDays: number,
): { label: string; tier: 'green' | 'yellow' | 'red' } {
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000
  const deleteAt = new Date(startedAt).getTime() + retentionMs
  const timeLeft = deleteAt - Date.now()

  // Color tier — proportional to the configured retention period
  let tier: 'green' | 'yellow' | 'red'
  if (timeLeft > retentionMs * 0.25) {
    tier = 'green'
  } else if (timeLeft > retentionMs * 0.1) {
    tier = 'yellow'
  } else {
    tier = 'red'
  }

  // Display label — days → hours → minutes
  let label: string
  if (timeLeft >= 24 * 60 * 60 * 1000) {
    label = `${Math.floor(timeLeft / (24 * 60 * 60 * 1000))}d`
  } else if (timeLeft >= 60 * 60 * 1000) {
    label = `${Math.floor(timeLeft / (60 * 60 * 1000))}h`
  } else {
    const mins = Math.floor(timeLeft / 60_000)
    label = mins > 0 ? `${mins}m` : '< 1m'
  }

  return { label, tier }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: all `formatExpiry` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/format.ts packages/web/src/lib/format.test.ts
git commit -m "feat: add formatExpiry utility with proportional urgency tiers"
```

---

## Task 2: Auto-refresh runs list every 60 s

**Files:**
- Modify: `packages/web/src/hooks/useRuns.ts`

- [ ] **Step 1: Add `refetchInterval`**

Replace the entire file content of `packages/web/src/hooks/useRuns.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchRuns } from '../lib/api.js'

export function useRuns() {
  return useQuery({
    queryKey: ['runs'],
    queryFn: fetchRuns,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/hooks/useRuns.ts
git commit -m "feat: poll runs list every 60s so deleted runs disappear automatically"
```

---

## Task 3: `useSettings` hook

**Files:**
- Create: `packages/web/src/hooks/useSettings.ts`

- [ ] **Step 1: Create the hook**

Create `packages/web/src/hooks/useSettings.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchSettings } from '../lib/api.js'

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    staleTime: 5 * 60_000, // settings change rarely
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/hooks/useSettings.ts
git commit -m "feat: add useSettings hook for cached settings access"
```

---

## Task 4: `ExpiryChip` component

**Files:**
- Create: `packages/web/src/components/ExpiryChip.tsx`

- [ ] **Step 1: Create the component**

Create `packages/web/src/components/ExpiryChip.tsx`:

```tsx
type Tier = 'green' | 'yellow' | 'red'

const CHIP_STYLES: Record<Tier, string> = {
  green: 'bg-tn-green/15 text-tn-green',
  yellow: 'bg-tn-yellow/15 text-tn-yellow',
  red: 'bg-tn-red/15 text-tn-red',
}

const DOT_STYLES: Record<Tier, string> = {
  green: 'bg-tn-green',
  yellow: 'bg-tn-yellow',
  red: 'bg-tn-red',
}

export default function ExpiryChip({ label, tier }: { label: string; tier: Tier }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-display text-xs font-semibold ${CHIP_STYLES[tier]}`}
    >
      <span className={`inline-block size-1.5 flex-shrink-0 rounded-full ${DOT_STYLES[tier]}`} />
      {label}
    </span>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/ExpiryChip.tsx
git commit -m "feat: add ExpiryChip component for retention countdown display"
```

---

## Task 5: Add "Expires in" column to `RunsTable`

**Files:**
- Modify: `packages/web/src/components/RunsTable.tsx`

- [ ] **Step 1: Update `RunsTable`**

In `packages/web/src/components/RunsTable.tsx`, make these three changes:

**1. Add imports** (after the existing imports at the top):
```tsx
import ExpiryChip from './ExpiryChip.js'
import { formatExpiry } from '../lib/format.js'
```

**2. Add `retentionDays` to the Props interface** (replace existing `interface Props`):
```tsx
interface Props {
  runs: RunRecord[]
  isAdmin?: boolean
  retentionDays: number
  onDeleteSuccess?: () => void
}
```

**3. Destructure `retentionDays` from props** (replace existing function signature):
```tsx
export default function RunsTable({ runs, isAdmin, retentionDays, onDeleteSuccess }: Props) {
```

**4. Add "Expires in" to `dataHeaders`** (replace existing `dataHeaders` line):
```tsx
const dataHeaders = ['Project / Branch', 'Commit', 'Status', 'When', 'Expires in', '']
```

**5. Add the new `<td>` cell after the "When" cell** (after the `<td>` that renders `formatRelativeTime`, before the actions `<td>`):
```tsx
<td className="px-4 py-3">
  <ExpiryChip {...formatExpiry(run.startedAt, retentionDays)} />
</td>
```

The full tbody row after the change looks like:
```tsx
<tr
  key={run.runId}
  className="border-l-2 border-l-transparent transition-all duration-150 hover:border-l-tn-blue hover:bg-tn-highlight/40"
>
  {isAdmin && (
    <td className="px-4 py-3">
      <input
        type="checkbox"
        checked={selected.has(run.runId)}
        onChange={() => toggleOne(run.runId)}
        aria-label={`Select run ${run.runId}`}
        className="cursor-pointer accent-tn-blue"
      />
    </td>
  )}
  <td className="px-4 py-3">
    <div className="font-display font-semibold text-tn-fg">{run.project}</div>
    {run.branch && (
      <div className="mt-0.5 font-mono text-xs text-tn-blue">{run.branch}</div>
    )}
  </td>
  <td className="px-4 py-3">
    {run.commitSha ? (
      <code className="font-mono text-xs text-tn-muted">
        {run.commitSha.slice(0, 7)}
      </code>
    ) : (
      <span className="text-xs text-tn-muted">—</span>
    )}
  </td>
  <td className="px-4 py-3">
    <StatusBadge status={run.status} />
  </td>
  <td className="px-4 py-3 font-mono text-xs text-tn-muted">
    {formatRelativeTime(run.startedAt)}
  </td>
  <td className="px-4 py-3">
    <ExpiryChip {...formatExpiry(run.startedAt, retentionDays)} />
  </td>
  <td className="px-4 py-3 text-right">
    <div className="flex items-center justify-end gap-4">
      <Link
        to={`/runs/${run.runId}`}
        className="font-display text-xs font-semibold tracking-wide text-tn-blue transition-colors hover:text-tn-purple"
      >
        View →
      </Link>
      {isAdmin && (
        <button
          type="button"
          onClick={() => handleDeleteOne(run.runId)}
          className="font-display text-xs text-tn-muted transition-colors hover:text-tn-red"
        >
          Delete
        </button>
      )}
    </div>
  </td>
</tr>
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @playwright-cart/web typecheck
```

Expected: no errors. If TypeScript complains about `retentionDays` being required but not passed anywhere yet, that's expected — it'll be fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/RunsTable.tsx
git commit -m "feat: add Expires in column to RunsTable"
```

---

## Task 6: Wire `RunsPage` to pass `retentionDays`

**Files:**
- Modify: `packages/web/src/pages/RunsPage.tsx`

- [ ] **Step 1: Update `RunsPage`**

In `packages/web/src/pages/RunsPage.tsx`, make these changes:

**1. Add import** (alongside existing hook imports):
```tsx
import { useSettings } from '../hooks/useSettings.js'
```

**2. Call `useSettings` inside the component** (add after the existing `useCurrentUser` call):
```tsx
const { data: settings } = useSettings()
const retentionDays = settings?.data_retention_days ?? 90
```

**3. Pass `retentionDays` to `<RunsTable>`** (replace the existing `<RunsTable>` line):
```tsx
<RunsTable runs={filtered} isAdmin={isAdmin} retentionDays={retentionDays} onDeleteSuccess={() => refetch()} />
```

The full updated component:

```tsx
import { useSearchParams } from 'react-router-dom'
import { FilterBar, applyFilters } from '../components/FilterBar.js'
import RunsTable from '../components/RunsTable.js'
import StatsBar from '../components/StatsBar.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useRuns } from '../hooks/useRuns.js'
import { useSettings } from '../hooks/useSettings.js'

export default function RunsPage() {
  const [params] = useSearchParams()
  const { data: runs, isLoading, error, refetch } = useRuns()
  const { isAdmin } = useCurrentUser()
  const { data: settings } = useSettings()
  const retentionDays = settings?.data_retention_days ?? 90

  if (isLoading) return <Skeleton />

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="mb-2 font-mono text-sm text-tn-red">Failed to load runs.</p>
        <p className="mb-4 font-mono text-xs text-tn-muted">{error.message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-tn-border px-4 py-2 font-display text-sm text-tn-fg transition-colors hover:bg-tn-highlight"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!runs || runs.length === 0) return <EmptyState />

  const filtered = applyFilters(runs, params)

  return (
    <div>
      {/* Page header: title left, filters right */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-lg font-bold uppercase tracking-[0.15em] text-tn-fg">
          Runs
        </h1>
        <FilterBar runs={runs} />
      </div>

      {/* Stats strip */}
      <StatsBar runs={runs} />

      {/* Table */}
      <RunsTable runs={filtered} isAdmin={isAdmin} retentionDays={retentionDays} onDeleteSuccess={() => refetch()} />
    </div>
  )
}
```

(`Skeleton` and `EmptyState` functions at the bottom of the file are unchanged.)

- [ ] **Step 2: Run all tests and typecheck**

```bash
pnpm --filter @playwright-cart/web test && pnpm --filter @playwright-cart/web typecheck
```

Expected: all tests PASS, no type errors.

- [ ] **Step 3: Smoke test in the browser**

```bash
pnpm dev
```

Open http://localhost:5173. Verify:
- The Runs table shows an "Expires in" column
- New runs (started today, 90d retention) show a green chip with ~90d
- Chip colors shift correctly if you temporarily lower `data_retention_days` in Settings to 10 (runs older than 2.5d turn yellow, older than 9d turn red)
- Wait up to 60s with the page open — if you manually delete a run via the "Delete" button or the API, the row disappears without a page reload

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/RunsPage.tsx
git commit -m "feat: wire retention days from settings into RunsTable for expiry display"
```
