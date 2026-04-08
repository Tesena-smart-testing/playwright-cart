# Run Expiry Column Design

**Date:** 2026-04-08
**Status:** Approved

## Context

Test runs are automatically deleted by the server's retention job (`packages/server/src/retention.ts`) after a configurable number of days (`data_retention_days`, default 90, range 1–180). Deletion is based on `runs.startedAt`. Users currently have no visibility into when a run will be purged — the goal is to surface that information concisely on each row of the Runs table.

## Decisions

| Decision | Choice |
|---|---|
| Placement | Dedicated "Expires in" column (after "When") |
| Urgency coloring | Proportional to the configured retention period |
| Time granularity | Days → hours → minutes |
| Stale run removal | `useRuns` polls every 60s; deleted runs disappear automatically |

## Logic

```
deleteAt  = run.startedAt + retentionDays × 24h
timeLeft  = deleteAt − now
```

**Display label:**
- `timeLeft ≥ 24h` → `"Xd"` (e.g. `43d`)
- `timeLeft ≥ 1h`  → `"Xh"` (e.g. `18h`)
- `timeLeft < 1h`  → `"Xm"` (e.g. `34m`)

**Color tier** (proportional to `retentionDays`):
- `timeLeft > 25% of retentionDays` → **green**
- `timeLeft 10–25% of retentionDays` → **yellow**
- `timeLeft < 10% of retentionDays` → **red**

Example at 90-day retention: green > 22d, yellow 9–22d, red < 9d.

## Components

### 1. `useRuns` hook — `packages/web/src/hooks/useRuns.ts` (modify)

Add `refetchInterval: 60_000` so the list re-fetches every 60 seconds. Runs deleted by the retention job (which runs hourly) will disappear from the UI within one poll cycle. No other changes — react-query drops stale keys automatically when they're absent from the new response.

The `RunDetailPage` already handles deletion gracefully: `fetchRun` throws `NotFoundError` on a 404, and the page renders "Run not found." with a back link. No changes needed there.

### 2. `useSettings` hook — `packages/web/src/hooks/useSettings.ts` (new)

Wraps `fetchSettings()` (already in `packages/web/src/lib/api.ts`) with react-query, following the same pattern as `useRuns.ts`. Returns `{ data_retention_days: number }`.

### 2. `formatExpiry` — `packages/web/src/lib/format.ts` (extend)

New export added to the existing format utilities file:

```ts
formatExpiry(startedAt: string, retentionDays: number): { label: string; tier: 'green' | 'yellow' | 'red' }
```

Computes `deleteAt`, `timeLeft`, selects tier by proportion, formats label by granularity bucket.

### 3. `ExpiryChip` component — `packages/web/src/components/ExpiryChip.tsx` (new)

Small presentational component. Receives `label` and `tier`, renders a colored pill matching the existing `StatusBadge` chip style (theme tokens: `--tn-green`, `--tn-yellow`, `--tn-red` with 15% opacity backgrounds and colored dot + text).

### 4. `RunsTable` — `packages/web/src/components/RunsTable.tsx` (modify)

- Accept new `retentionDays: number` prop
- Add "Expires in" column header after "When"
- Render `<ExpiryChip>` in each row using `formatExpiry(run.startedAt, retentionDays)`

### 5. `RunsPage` — `packages/web/src/pages/RunsPage.tsx` (modify)

- Call `useSettings()` 
- Pass `retentionDays={settings?.data_retention_days ?? 90}` to `<RunsTable>`

## Data Flow

```
RunsPage
  → useSettings()           (GET /api/settings, react-query)
  → useRuns()               (GET /api/runs, polls every 60s)
  → RunsTable(retentionDays)
      → formatExpiry(run.startedAt, retentionDays)  → { label, tier }
      → ExpiryChip(label, tier)

RunDetailPage
  → useRun(runId)           (GET /api/runs/:runId)
  → on 404: renders "Run not found." + back link  [already implemented]
```

## Verification

1. Start the full stack: `docker-compose up` or `pnpm dev`
2. Open the Runs page — confirm "Expires in" column appears with colored chips
3. Verify green chip on a brand-new run (e.g. created seconds ago with 90d retention → should show ~90d, green)
4. Manually test `formatExpiry` logic in unit tests:
   - Run started 80d ago, retention 90d → timeLeft = 10d → 11% of 90 → yellow, label "10d"
   - Run started 89d 23h ago, retention 90d → timeLeft ≈ 1h → red, label "1h" or "Xm"
   - Run started 89d 23h 50m ago → timeLeft ≈ 10m → red, label "10m"
5. Change `data_retention_days` in Settings to 30 — confirm thresholds shift (warn at 7d, urgent at 3d)
6. Stale run removal: manually delete a run via the API or DB, wait up to 60s — confirm the row disappears from the Runs page without a page reload
7. Deleted run detail: navigate to a run detail URL for a deleted run — confirm "Run not found." message and back link render correctly (already works, just verify no regression)
