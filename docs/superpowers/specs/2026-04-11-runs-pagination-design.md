# Runs Pagination Design

**Date:** 2026-04-11
**Status:** Approved

## Context

The runs list page currently fetches all rows from the database in a single query and renders them without pagination. As the number of runs grows this becomes slow and unwieldy. The feature adds server-side pagination (10/25/50/100 rows per page, default 10) with per-user preference persistence, and exposes the preference in the user settings page.

---

## Data Model

Add one column to the `users` table:

```sql
ALTER TABLE users ADD COLUMN runs_per_page SMALLINT NOT NULL DEFAULT 10;
```

- Allowed values: `10 | 25 | 50 | 100`
- Validated server-side on `PATCH /api/users/me`
- Stored as integer (not enum) to avoid migration cost for future values
- Returned automatically via `GET /api/auth/me` — no new endpoint needed

### Migration

New Drizzle migration file generated via `drizzle-kit generate`.

---

## Backend

### `storage.ts` — `listRuns()`

Signature changes from `listRuns(): Promise<RunRecord[]>` to:

```ts
type RunsQuery = {
  page: number        // 1-based
  pageSize: number    // 10 | 25 | 50 | 100
  project?: string
  branch?: string
  status?: string
}

async function listRuns(query: RunsQuery): Promise<{ runs: RunRecord[]; total: number }>
```

Implementation:
- Build Drizzle `WHERE` clause from optional filter params
- `LIMIT pageSize OFFSET (page - 1) * pageSize`
- Count total matching rows with a separate `COUNT(*)` query using the same `WHERE` clause

### `runs/routes.ts` — `GET /api/runs`

Accepts query params:

```
?page=1&pageSize=10&project=foo&branch=main&status=failed
```

Response shape:

```json
{
  "runs": [...],
  "total": 347,
  "page": 1,
  "pageSize": 10
}
```

### `users/routes.ts` — `PATCH /api/users/me`

Add `runsPerPage` to accepted body; validate it is one of `[10, 25, 50, 100]`.

---

## Frontend

### `lib/api.ts` — `fetchRuns()`

Add pagination + filter params:

```ts
fetchRuns(params: {
  page: number
  pageSize: number
  project?: string
  branch?: string
  status?: string
}): Promise<{ runs: Run[]; total: number; page: number; pageSize: number }>
```

### `hooks/useRuns.ts`

- Accept `page` and `pageSize` as inputs
- Include both in the React Query cache key so each page is cached independently
- Return `total` from response for page count calculation

### `pages/RunsPage.tsx`

- Read `me.runsPerPage` from auth context to initialize `pageSize` state
- Maintain `page` state (number, resets to 1 on filter or pageSize change)
- Pass current filter params (from URL) + page + pageSize to `useRuns()`
- Existing `FilterBar` unchanged; filter change triggers `setPage(1)`

**Pagination UI:**
- Page size selector (top-right of table): segmented control or dropdown with values `10 | 25 | 50 | 100`
  - On change: call `updateMe({ runsPerPage: n })`, update local `pageSize` state, reset `page` to 1
- Bottom of table: Prev / Next buttons + "Page X of Y" + "N runs total"

### `pages/SettingsPage.tsx`

Add "Runs per page" dropdown in the Account section (alongside theme preference):
- Values: `10 | 25 | 50 | 100`
- Saves via `updateMe({ runsPerPage: n })` on change

---

## Verification

1. `pnpm --filter @playwright-cart/server test` — storage tests pass with new signature
2. `pnpm typecheck` — no type errors
3. `pnpm lint` — no lint errors
4. Manual: start full stack, verify pagination controls render, page navigation works, filter changes reset page, preference persists across page reload, settings page dropdown saves preference
