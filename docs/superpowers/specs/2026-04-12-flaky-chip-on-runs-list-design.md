# Flaky Chip on Runs List

**Date:** 2026-04-12  
**Status:** Approved

## Context

Users want to see at a glance which runs had flaky tests — tests that failed on first attempt but passed on retry. Currently, a run marked "passed" gives no indication of flakiness. Adding a chip lets users quickly identify runs worth investigating without clicking into each one.

## Definition of Flaky

A test is flaky if: `retry > 0 AND status = 'passed'` on its final attempt record. Each retry attempt in Playwright generates a distinct `testId` and a separate row in the `tests` table (unique on `runId, testId`). A run's `flakyCount` is the count of such test rows in that run.

## Implementation

### Approach: SQL aggregate in runs list query (Option A)

No schema migration. No new endpoints. One extra batch query per page fetch.

### Server: `packages/server/src/runs/storage.ts`

1. Add `flakyCount?: number` to `RunRecord` interface.
2. In `listRuns`, after fetching paginated rows, run a second query:
   ```sql
   SELECT run_id, COUNT(*) as flaky_count
   FROM tests
   WHERE run_id IN (<paginated runIds>)
     AND retry > 0
     AND status = 'passed'
   GROUP BY run_id
   ```
   Using Drizzle: `count()`, `inArray`, `gt(tests.retry, 0)`, `eq(tests.status, 'passed')`, `groupBy(tests.runId)`.
3. Build a `Map<runId, flakyCount>` and merge into `runs.map(toRunRecord)` inline (don't modify `toRunRecord` — it's also called by `getRun`).

### Frontend: `packages/web/src/lib/api.ts`

Add `flakyCount?: number` to `RunRecord`.

### Frontend: `packages/web/src/components/RunsTable.tsx`

In the Status column (`<td>`), wrap `<StatusBadge>` in a `flex-col gap-1` container and add below it:

```tsx
{(run.flakyCount ?? 0) > 0 && (
  <span className="inline-flex items-center gap-1 rounded-full bg-tn-yellow/15 px-2 py-0.5 font-display text-xs font-semibold text-tn-yellow">
    ↻ {run.flakyCount} flaky
  </span>
)}
```

Yellow matches existing flaky color used in `RunHeader`, `SuiteGroup`, and `TestHeader`.

## Files Modified

| File | Change |
|------|--------|
| `packages/server/src/runs/storage.ts` | Add `flakyCount` to `RunRecord`; compute in `listRuns` |
| `packages/web/src/lib/api.ts` | Add `flakyCount?: number` to `RunRecord` |
| `packages/web/src/components/RunsTable.tsx` | Render flaky chip in Status column |

## Verification

1. `pnpm --filter @playwright-cart/server test` — server unit tests pass
2. `pnpm typecheck` — no type errors
3. `pnpm lint` — no lint errors
4. Visual: run `pnpm dev`, navigate to Runs page, confirm flaky chip appears for runs with retried+passed tests and is absent for runs without
