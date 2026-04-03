# Frontend Design Spec — Playwright Cart Phase 2

**Date:** 2026-04-03  
**Status:** Approved  

---

## Context

Phase 1 delivered the reporter (Playwright custom reporter that uploads test data) and the server (Hono REST API that receives and stores run/test data on disk). Phase 2 builds the dashboard that lets a small team view uploaded test runs, inspect per-test results, see cross-run statistics, and open Playwright HTML reports and traces.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| API server | Extend existing Hono server | All data is already there; separate server adds complexity with no benefit at this scale |
| Routing | React Router v6 | Standard, stable, integrates with Vite + React 19 |
| Styling | Tailwind CSS v4 | Perfect for utility-driven dark/light theming, co-located styles |
| Data fetching | TanStack Query v5 | Caching, background refetch, polling for live runs, `useQueries` for cross-run aggregation |
| Theme | TokyoNight Dark + TokyoNight Day | Developer-native palette; system preference as default, toggle in nav |
| Layout | Table + top nav | Clean, scalable, familiar to engineers |
| Run detail | Suites grouped by `titlePath[0]`, collapsible | Mirrors Playwright's native test hierarchy |
| Test detail | Dedicated page | Ample space for errors, retries, attachments, trace links |

---

## Architecture

### Server changes

Two additions to `packages/server`:

1. **New endpoint:** `GET /api/runs/:runId/tests/:testId`  
   Returns a single `TestRecord` from `{DATA_DIR}/{runId}/tests/{testId}.json`.  
   Used by `TestDetailPage` to avoid loading the full run.

2. **Bug fix:** `packages/web/src/App.tsx` calls `/api/reports` which does not exist.  
   Update to `/api/runs`.

No changes to ingestion endpoints (`POST /api/runs`, `POST /api/runs/:runId/tests`, etc.).

### Routes

```
/                              → RunsPage
/runs/:runId                   → RunDetailPage
/runs/:runId/tests/:testId     → TestDetailPage
```

### Attachment / trace URLs

The server's `/reports/*` handler serves static files from the `data/` root. Attachments stored at `{DATA_DIR}/{runId}/attachments/{testId}/{filename}` are therefore accessible at `/reports/{runId}/attachments/{testId}/{filename}`.

Playwright trace files (`trace.zip`) open via: `https://trace.playwright.dev/?trace=<absolute-attachment-url>`

> **Note:** `trace.playwright.dev` requires the trace URL to be publicly reachable. For private networks, the Playwright HTML report (`reportUrl`) already includes a built-in trace viewer — so "Open Report ↗" is always the fallback.

---

## Component Tree

```
App
└── Layout
    ├── TopNav (logo, theme toggle — dark/light/system)
    ├── RunsPage (/)
    │   ├── StatsBar (cross-run: total runs, pass rate %, failed count)
    │   ├── FilterBar (project dropdown, branch dropdown, status dropdown)
    │   └── RunsTable
    │       └── RunRow[] → navigates to /runs/:runId
    ├── RunDetailPage (/runs/:runId)
    │   ├── RunHeader (project, branch, commitSha, status badge, duration, "Open Report ↗")
    │   ├── RunStats (passed / failed / skipped / timedOut counts)
    │   └── SuiteGroup[] (collapsible, grouped by titlePath[0])
    │       └── TestRow[] → navigates to /runs/:runId/tests/:testId
    └── TestDetailPage (/runs/:runId/tests/:testId)
        ├── TestHeader (titlePath breadcrumb, status badge, duration, retry count)
        ├── ErrorBlock[] (error message + stack trace, only when failed/timedOut)
        ├── AnnotationList (if annotations present)
        └── AttachmentList
            └── AttachmentItem (download link; trace.zip → "Open Trace ↗" to trace.playwright.dev)
```

---

## Data Fetching

| Hook | Endpoint | Notes |
|---|---|---|
| `useRuns()` | `GET /api/runs` | Powers RunsPage + StatsBar; `staleTime: 30s` |
| `useRun(runId)` | `GET /api/runs/:runId` | Returns `RunRecord & { tests: TestRecord[] }`; polls every 5s when `status === 'running'` |
| `useTest(runId, testId)` | `GET /api/runs/:runId/tests/:testId` | Powers TestDetailPage |

**Cross-run statistics** are derived client-side from the `useRuns()` result — no additional endpoints needed.

**Live polling:** `useRun` sets `refetchInterval: 5000` when `run.status === 'running'`, stops automatically when the run completes.

---

## Theming

**TokyoNight Dark** (official palette):

| Token | Value | Usage |
|---|---|---|
| `bg` | `#1a1b26` | Page background |
| `bg-panel` | `#16161e` | Cards, nav, table |
| `bg-highlight` | `#292e42` | Hover, selection, filter dropdowns |
| `fg` | `#c0caf5` | Primary text |
| `fg-muted` | `#565f89` | Secondary text, labels |
| `blue` | `#7aa2f7` | Links, branch names, accents |
| `purple` | `#bb9af7` | Logo, headings |
| `green` | `#9ece6a` | Passed status |
| `red` | `#f7768e` | Failed status |
| `yellow` | `#e0af68` | Running / timedOut status |
| `border` | `#292e42` | Card/table borders |

**TokyoNight Day** (custom derivation):

| Token | Value | Usage |
|---|---|---|
| `bg` | `#e1e2e7` | Page background |
| `bg-panel` | `#d0d5e3` | Cards, nav, table |
| `bg-highlight` | `#c4c8da` | Hover, filter dropdowns |
| `fg` | `#3760bf` | Primary text |
| `fg-muted` | `#848cb5` | Secondary text, labels |
| `blue` | `#2e7de9` | Links, branch names |
| `purple` | `#9854f1` | Logo, headings |
| `green` | `#587539` | Passed status |
| `red` | `#f52a65` | Failed status |
| `yellow` | `#8c6c3e` | Running / timedOut status |
| `border` | `#c4c8da` | Card/table borders |

**Theme selection:** Implemented via CSS custom properties on `:root` + a `data-theme` attribute on `<html>`. Default reads `prefers-color-scheme`. Toggle in `TopNav` cycles: system → dark → light.

---

## Filtering (RunsPage)

Three dropdowns in `FilterBar`, all client-side (no server round-trips):

- **Project** — unique values from `runs[].project`
- **Branch** — unique values from `runs[].branch`
- **Status** — fixed set: `running | passed | failed | interrupted | timedOut`

Filters are `AND`-combined. Active filters persist in URL search params (`?project=my-app&status=failed`) so links are shareable.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `GET /api/runs` fails | Inline error message + retry button on RunsPage |
| Run not found (404) | "Run not found" message with ← back link |
| Test not found (404) | "Test not found" message with ← back link |
| Run has no tests yet | "No test results yet" empty state (normal for `status: running`) |
| No runs at all | Empty state with snippet showing how to add the reporter to `playwright.config.ts` |

Loading states use skeleton rows, not spinners.

---

## Statistics (StatsBar)

Derived from `GET /api/runs` response, aggregated client-side:

- **Total runs** — `runs.length`
- **Pass rate** — `passed / completed * 100` where `completed = runs.filter(r => r.status !== 'running')`
- **Failed** — `runs.filter(r => r.status === 'failed').length`

Displayed as three stat cards in a horizontal bar above the runs table.

---

## New Dependencies

```
packages/web:
  react-router-dom        ^6
  @tanstack/react-query   ^5
  tailwindcss             ^4

packages/server:
  (none — one new route handler only)
```

---

## Verification

1. `pnpm --filter @playwright-cart/web dev` — dev server starts, no console errors
2. Open `/` — runs table renders, StatsBar shows aggregated counts, FilterBar dropdowns populate from live data
3. Filter by status `failed` — table filters correctly, URL params update
4. Click a run row — navigates to `/runs/:runId`, suites render grouped and collapsible
5. Click a failed test — navigates to `/runs/:runId/tests/:testId`, error block and attachments visible
6. If a trace attachment exists — "Open Trace ↗" link opens `trace.playwright.dev` with correct URL
7. If run has `reportUrl` — "Open Report ↗" button opens the Playwright HTML report in new tab
8. Theme toggle — dark → light → system, persists across page reload (localStorage)
9. System preference — `prefers-color-scheme: dark/light` applies on first load
10. `pnpm --filter @playwright-cart/server test` — existing server tests still pass after new endpoint added
