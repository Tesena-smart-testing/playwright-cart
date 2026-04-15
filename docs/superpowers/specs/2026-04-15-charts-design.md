# Charts Feature — Design Spec

**Date:** 2026-04-15  
**Status:** Approved  
**Branch:** `feature/charts` (separate git branch + worktree)

---

## 1. Overview

Add a dedicated Charts section to the web app so users can see how key test health indicators evolve over time. The feature spans both the server (new aggregation endpoints) and the web frontend (new pages, components, charting library).

This is a multi-session feature. Each session targets a discrete vertical slice.

---

## 2. Metrics / Charts in Scope

| ID | Chart Name | Metric | Color token |
|----|-----------|--------|-------------|
| A | Pass Rate | % tests passing per bucket | `tn-green` |
| B | Failures | Failure count per bucket | `tn-red` |
| C | Flaky Tests | Flaky count per bucket | `tn-yellow` |
| D | Avg Duration | Avg (+ p95) test duration per bucket | `tn-blue` |
| E | Total Tests | Total tests executed per bucket | `tn-purple` |
| F | Test Reliability | Per-test pass/fail/flaky dot history | mixed |

---

## 3. Navigation & Routing

Add **"Charts"** link to `TopNav.tsx` between "Runs" and "Settings".

New routes in `App.tsx`:

```
/charts                          → ChartsPage       (dashboard of tiles)
/charts/pass-rate                → ChartDetailPage  (metric A)
/charts/failures                 → ChartDetailPage  (metric B)
/charts/flaky                    → ChartDetailPage  (metric C)
/charts/duration                 → ChartDetailPage  (metric D)
/charts/total-tests              → ChartDetailPage  (metric E)
/charts/test-reliability         → TestReliabilityPage (metric F)
```

All routes are protected (existing `ProtectedRoute` wrapper applies).

---

## 4. UX Design

### 4.1 Dashboard — `/charts`

- **Global filter bar** at top: Project / Branch / Tags dropdowns. Affects all tiles. Defaults to "all".
- **3-column tile grid** (responsive: 1-col mobile, 2-col tablet, 3-col desktop).
- Each tile shows: metric name, current value, delta vs. previous period, mini sparkline (8-point bar preview).
- Each tile border highlights with its accent color on hover.
- Click tile → navigate to `/charts/<id>`.
- Tile F (Test Reliability) is different: shows "Search a test…" prompt, no sparkline. Click → `/charts/test-reliability`.
- **Auto-refresh:** subscribes to the existing SSE stream (`GET /api/events` via `useServerEvents`). When a `run:complete` event arrives, invalidates the `runTimeline` React Query cache — all tiles refresh automatically.
- **Tile reordering:** tiles are drag-and-drop sortable via `@dnd-kit/sortable`. The order persists server-side per user (same pattern as `theme` and `runsPerPage`). On drop, optimistic local update + debounced `PATCH /api/users/me` with the new `chartOrder` array. Null/missing `chartOrder` = default order (A→B→C→D→E→F).

### 4.2 Individual Chart Page — `/charts/<id>`

- **Breadcrumb**: Charts › [Chart Name]
- **Stat pills** (top-right): current value, period average, trend direction.
- **Controls bar**:
  - Granularity toggle: `Per run | Daily | Weekly`
  - Time range (date-based): `7d | 30d | 90d | All`
  - Time range (run-count): `Last 10 | Last 25 | Last 50` (visible when granularity = Per run)
  - Per-chart filter override: Branch dropdown (inherits global filter by default)
- **Main chart**: Full-width Recharts bar or line chart.
- **"← Back to all charts"** link at bottom.
- **Auto-refresh:** same SSE subscription — `run:complete` event triggers `queryClient.invalidateQueries(['runTimeline', ...params])`, chart re-fetches silently in background.

### 4.3 Test Reliability Page — `/charts/test-reliability`

- **Search bar** at top with autocomplete (queries test titles from DB).
- When a test is selected:
  - URL becomes `/charts/test-reliability?testId=<id>` (shareable/bookmarkable).
  - **Stat pills**: pass rate %, flaky run count, failure count, avg duration.
  - **Controls**: Last 25 / 50 / All runs + Branch override.
  - **Dot timeline**: one dot per run (newest right). Green = passed, Red = failed, Yellow = flaky (passed after retry), Grey = skipped. Hover tooltip: run ID, date, branch.
  - **Duration sub-chart**: bar chart of duration per run, aligned to same X-axis as dot timeline.
- **Auto-refresh:** SSE `run:complete` event invalidates `['testHistory', testId]` query — dot timeline gains a new dot automatically when a run containing this test finishes.
- Two entry points:
  1. Search box on this page.
  2. Flaky badge on `RunDetailPage` / `TestHeader` → links to `/charts/test-reliability?testId=<id>`.

---

## 5. Server Changes

### 5.0 Schema — `users` table

Add `chartOrder` column (nullable text array, default `null`):

```ts
// src/db/schema.ts
chartOrder: text('chart_order').array()  // null = default order [A,B,C,D,E,F]
```

New Drizzle migration required. Extend `PATCH /api/users/me` to accept and validate `chartOrder` (array of chart IDs, exactly the 6 known IDs in any order).

Return `chartOrder` in `GET /api/auth/me` response so `useCurrentUser()` already carries the preference — no extra fetch needed.

---

## 6. Server — New Endpoints

### 6.1 `GET /api/runs/stats/timeline`

Time-bucketed aggregate for metrics A–E.

**Query params:**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `project` | string | — | optional filter |
| `branch` | string | — | optional filter |
| `tag` | string[] | — | repeatable, AND-joined |
| `interval` | `run\|day\|week` | `day` | grouping granularity |
| `days` | number | 30 | date-based window (ignored when `limit` set) |
| `limit` | number | — | last N runs (only valid with `interval=run`) |

**Response:**

```ts
{
  buckets: Array<{
    key: string          // ISO date (day/week) or runId (per-run)
    startedAt: string    // ISO timestamp of first run in bucket
    total: number        // total tests
    passed: number
    failed: number
    flaky: number        // retry > 0 AND status = 'passed'
    avgDurationMs: number
    p95DurationMs: number
    runCount: number     // how many runs in this bucket
  }>
}
```

**Implementation:** Drizzle query with `GROUP BY date_trunc(interval, startedAt)` or `GROUP BY runId`. Aggregates from the `tests` table joined to `runs`.

### 6.2 `GET /api/tests/search`

Autocomplete — returns distinct test identities matching a title query.

**Query params:** `q` (string, min 2 chars), `project?`

**Response:**

```ts
{
  tests: Array<{
    testId: string
    title: string
    titlePath: string[]
    locationFile: string
  }>
}
```

**Implementation:** `SELECT DISTINCT testId, title, titlePath, locationFile FROM tests WHERE title ILIKE '%q%'` limited to 20 results. No new table needed.

### 6.3 `GET /api/tests/:testId/history`

Per-test run history for dot timeline.

**Query params:** `limit?` (default 50), `branch?`

**Response:**

```ts
{
  test: { testId: string; title: string; titlePath: string[]; locationFile: string }
  history: Array<{
    runId: string
    startedAt: string
    status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
    durationMs: number
    retry: number        // >0 = flaky
    branch: string | null
  }>
}
```

**Implementation:** JOIN `tests` + `runs` on `runId`, WHERE `testId = :testId`, ORDER BY `startedAt DESC`.

---

## 6. Frontend Architecture

### 6.1 Libraries

**Recharts** — React-native, TypeScript-first, composable, responsive.

**@dnd-kit/core + @dnd-kit/sortable** — modern drag-and-drop, accessible, touch-friendly, purpose-built for sortable grids.

```bash
pnpm --filter @playwright-cart/web add recharts @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 6.2 New Files

```
packages/web/src/
├── pages/
│   ├── ChartsPage.tsx              ← dashboard of tiles (DnD sortable grid)
│   ├── ChartDetailPage.tsx         ← full chart (metrics A–E)
│   └── TestReliabilityPage.tsx     ← search + dot timeline (metric F)
├── components/
│   ├── charts/
│   │   ├── ChartTile.tsx           ← tile wrapper (sparkline + stat + name + drag handle)
│   │   ├── TrendChart.tsx          ← reusable bar/line chart (A, B, C, E)
│   │   ├── DurationChart.tsx       ← dual-series chart (avg + p95) for D
│   │   ├── DotTimeline.tsx         ← dot-per-run timeline for F
│   │   ├── ChartControls.tsx       ← granularity toggle + time range picker
│   │   └── ChartFilterBar.tsx      ← global + per-chart filter dropdowns
│   └── TestSearch.tsx              ← autocomplete search for test reliability
├── hooks/
│   ├── useRunTimeline.ts           ← GET /api/runs/stats/timeline
│   ├── useTestSearch.ts            ← GET /api/tests/search
│   └── useTestHistory.ts           ← GET /api/tests/:testId/history
└── lib/
    └── api.ts                      ← extend with fetchRunTimeline, fetchTestSearch, fetchTestHistory, patchMe (chartOrder)
```

### 6.3 Component Reuse Strategy

- `TrendChart` is the single reusable chart component for A, B, C, E. Accepts `data`, `color`, `valueKey`, `label` props. Renders a `ResponsiveContainer` + `BarChart` from Recharts.
- `DurationChart` extends the same pattern but renders two series (avg = solid, p95 = muted).
- `DotTimeline` is standalone — renders SVG circles via plain React (no Recharts needed, dots are simple).
- `ChartTile` wraps a mini `TrendChart` (or the search prompt for F) with the stat pill header. Exposes a drag handle (grab icon, top-right corner) used by `@dnd-kit/sortable`.
- `ChartControls` is used on both `ChartDetailPage` and `TestReliabilityPage`.

### 6.4 Tile Reordering — Implementation Detail

`ChartsPage` wraps the tile grid in `@dnd-kit`'s `DndContext` + `SortableContext`:

```tsx
// ChartsPage.tsx (sketch)
const [order, setOrder] = useState<ChartId[]>(user.chartOrder ?? DEFAULT_ORDER)

function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (active.id !== over?.id) {
    const newOrder = arrayMove(order, oldIndex, newIndex)
    setOrder(newOrder)                            // optimistic local update
    debouncedPatch({ chartOrder: newOrder })       // PATCH /api/users/me
  }
}
```

- Debounce: 500ms — avoids a request on every intermediate drag position.
- On mount: order read from `useCurrentUser().user.chartOrder` (already in the `/api/auth/me` response after the schema change).
- `null` chartOrder → falls back to `DEFAULT_ORDER = ['pass-rate','failures','flaky','duration','total-tests','test-reliability']`.

### 6.4 State & URL Design

- Global filter state: URL search params on `/charts` (`?project=X&branch=Y&tag=Z`). Passed as props into all tiles.
- Per-chart controls: URL search params on `/charts/<id>` (`?interval=day&days=30&branch=main`).
- Test reliability test selection: `?testId=abc123` — enables shareable links and browser back navigation.
- All data fetching via TanStack React Query (same pattern as existing hooks).
- **Auto-refresh via SSE:** `ChartsPage`, `ChartDetailPage`, and `TestReliabilityPage` each call `useServerEvents` (already exists at `hooks/useServerEvents.ts`). On `run:complete` event, call `queryClient.invalidateQueries` on the relevant query key. No polling needed — purely event-driven. The existing SSE hook handles reconnection.

---

## 7. Multi-Session Implementation Plan

| Session | Scope | Deliverable |
|---------|-------|-------------|
| **1** | Server | `chartOrder` column + migration, extend `PATCH /api/users/me`, 3 new endpoints + Drizzle queries + route wiring + tests |
| **2** | Web — Routing + Dashboard | TopNav update, App.tsx routes, `ChartsPage` with tiles + DnD reordering + persist via PATCH (static/mock data first) |
| **3** | Web — Chart Detail | `ChartDetailPage`, `TrendChart`, `DurationChart`, `ChartControls`, `useRunTimeline` hook |
| **4** | Web — Test Reliability | `TestReliabilityPage`, `DotTimeline`, `TestSearch`, `useTestSearch`, `useTestHistory` |
| **5** | Integration & Polish | Flaky badge → reliability link in `RunDetailPage`/`TestHeader`, SSE auto-refresh wiring on all chart pages, filter persistence, responsive tuning, loading/error states |

---

## 8. Branch Strategy

All work on branch `feature/charts`. Use a git worktree for isolation so `main` stays clean:

```bash
git worktree add ../playwright-cart-charts feature/charts
```

PRs from `feature/charts` → `main` at the end of each session (or at natural milestones). Never push directly to `main` for this feature.

---

## 9. Verification (end-to-end)

For each session:
1. `pnpm lint && pnpm typecheck` — zero errors
2. `pnpm --filter @playwright-cart/server test` — server unit tests pass
3. `pnpm --filter @playwright-cart/web test` — web unit tests pass
4. Manual smoke: `docker compose up` → navigate to `/charts`, verify tiles render, click through to detail, verify chart renders with real data

For Session 1 specifically: hit new endpoints via curl/Postman to verify response shapes before frontend work begins.

---

## 10. Out of Scope (explicitly excluded)

- Chart export (PNG/CSV) — future
- Alerting / thresholds — future
- Comparing two branches side-by-side on same chart — future
- ~~Real-time chart updates via SSE~~ — **implemented** (uses existing `useServerEvents` + query invalidation)
- Mobile-optimized touch interactions for charts — future (responsive layout yes, touch gestures no)
