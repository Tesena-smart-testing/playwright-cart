# Runs Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side pagination (10/25/50/100 per page, default 10) to the runs list with per-user preference stored in the DB, filter options sourced from a dedicated meta endpoint, and a page-size selector in both the runs page and user settings.

**Architecture:** `GET /api/runs` gains `page`/`pageSize`/`project`/`branch`/`status` query params and returns a paginated envelope including filter-aware aggregate stats. A new `GET /api/runs/meta` returns all distinct projects and branches for filter dropdowns. The user's preferred page size is stored as `runs_per_page` on the `users` table and exposed via `GET /api/auth/me`.

**Tech Stack:** Drizzle ORM (PostgreSQL), Hono, React 19, React Query, TailwindCSS (TokyoNight tokens)

---

## File Map

### Modified — server
| File | Change |
|------|--------|
| `packages/server/src/db/schema.ts` | Add `runsPerPage` column to `users` table |
| `packages/server/src/db/migrations/0004_*.sql` | Generated migration (drizzle-kit generate) |
| `packages/server/src/auth/types.ts` | Add `runsPerPage: number` to `AuthUser` |
| `packages/server/src/auth/middleware.ts` | Pass `runsPerPage` from DB user to context |
| `packages/server/src/auth/routes.ts` | Include `runsPerPage` in GET /me response |
| `packages/server/src/runs/storage.ts` | Update `listRuns()` — pagination, filters, stats |
| `packages/server/src/runs/routes.ts` | Update GET / route; add GET /meta route |
| `packages/server/src/users/routes.ts` | Accept `runsPerPage` in PATCH /me |
| `packages/server/src/runs/storage.test.ts` | Update listRuns tests for new signature |

### Modified — web
| File | Change |
|------|--------|
| `packages/web/src/lib/api.ts` | Update `CurrentUser`, `fetchRuns`, `updateMe`; add `fetchRunsMeta` |
| `packages/web/src/hooks/useRuns.ts` | Accept pagination + filter params |
| `packages/web/src/hooks/useRunsMeta.ts` | New hook — fetches distinct projects/branches |
| `packages/web/src/components/StatsBar.tsx` | Accept aggregate counts, not runs array |
| `packages/web/src/components/FilterBar.tsx` | Accept `projects`/`branches` props instead of `runs` |
| `packages/web/src/pages/RunsPage.tsx` | Add pagination state, page size selector, page controls |
| `packages/web/src/pages/SettingsPage.tsx` | Add `RunsPerPageSelector` in AccountTab |

---

## Task 1: DB Schema — add `runsPerPage` column

**Files:**
- Modify: `packages/server/src/db/schema.ts`

- [ ] **Step 1: Add `smallint` to schema imports and add column**

In `packages/server/src/db/schema.ts`, update the import and the `users` table:

```ts
import {
  bigint,
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
```

```ts
export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('user'),
  theme: userThemeEnum('theme').notNull().default('system'),
  runsPerPage: smallint('runs_per_page').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: Generate migration**

```bash
cd packages/server && pnpm exec drizzle-kit generate
```

Expected: a new file `packages/server/src/db/migrations/0004_<slug>.sql` containing:
```sql
ALTER TABLE "users" ADD COLUMN "runs_per_page" smallint DEFAULT 10 NOT NULL;
```

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/db/schema.ts packages/server/src/db/migrations/
git commit -m "feat(db): add runs_per_page column to users table"
```

---

## Task 2: Expose `runsPerPage` via Auth

**Files:**
- Modify: `packages/server/src/auth/types.ts`
- Modify: `packages/server/src/auth/middleware.ts`
- Modify: `packages/server/src/auth/routes.ts`

- [ ] **Step 1: Add `runsPerPage` to `AuthUser`**

In `packages/server/src/auth/types.ts`, update the `user` variant:

```ts
export type AuthUser =
  | {
      type: 'user'
      id: number
      username: string
      role: 'admin' | 'user'
      theme: 'dark' | 'light' | 'system'
      runsPerPage: number
      exp: number
      jti: string
    }
  | {
      type: 'apikey'
      keyId: number
    }

export type HonoEnv = {
  Variables: {
    authUser: AuthUser
  }
}
```

- [ ] **Step 2: Pass `runsPerPage` from DB in auth middleware**

In `packages/server/src/auth/middleware.ts`, inside the cookie branch where `c.set('authUser', ...)` is called, add the field:

```ts
c.set('authUser', {
  type: 'user',
  id: user.id,
  username: user.username,
  role: user.role,
  theme: user.theme,
  runsPerPage: user.runsPerPage,
  exp: result.exp,
  jti: result.jti,
})
```

- [ ] **Step 3: Include `runsPerPage` in GET /me response**

In `packages/server/src/auth/routes.ts`, update the `/me` handler:

```ts
authRouter.get('/me', (c) => {
  const authUser = c.get('authUser')
  if (authUser.type === 'apikey') {
    return c.json({ error: 'Forbidden' }, 403)
  }
  return c.json({
    id: authUser.id,
    username: authUser.username,
    role: authUser.role,
    theme: authUser.theme,
    runsPerPage: authUser.runsPerPage,
    expiresAt: authUser.exp,
  })
})
```

- [ ] **Step 4: Verify type-check passes**

```bash
pnpm --filter @playwright-cart/server exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth/types.ts packages/server/src/auth/middleware.ts packages/server/src/auth/routes.ts
git commit -m "feat(auth): expose runsPerPage in /me response"
```

---

## Task 3: Update `listRuns()` — pagination, filters, stats (TDD)

**Files:**
- Modify: `packages/server/src/runs/storage.ts`
- Modify: `packages/server/src/runs/storage.test.ts`

- [ ] **Step 1: Write failing tests for new `listRuns` signature**

Replace the existing `describe('listRuns', ...)` block in `packages/server/src/runs/storage.test.ts` with:

```ts
describe('listRuns', () => {
  it('returns empty result when no runs exist', async () => {
    const result = await storage.listRuns({ page: 1, pageSize: 10 })
    expect(result).toEqual({ runs: [], total: 0, totalPassed: 0, totalFailed: 0 })
  })

  it('returns runs sorted by startedAt descending', async () => {
    await storage.createRun({ runId: 'a', project: 'p', startedAt: '2026-04-02T09:00:00.000Z', status: 'running' })
    await storage.createRun({ runId: 'b', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })
    const result = await storage.listRuns({ page: 1, pageSize: 10 })
    expect(result.runs[0].runId).toBe('b')
    expect(result.runs[1].runId).toBe('a')
  })

  it('respects pageSize and page offset', async () => {
    for (let i = 0; i < 5; i++) {
      await storage.createRun({
        runId: `run-${i}`,
        project: 'p',
        startedAt: new Date(Date.now() + i * 1000).toISOString(),
        status: 'passed',
      })
    }
    const page1 = await storage.listRuns({ page: 1, pageSize: 3 })
    const page2 = await storage.listRuns({ page: 2, pageSize: 3 })
    expect(page1.runs).toHaveLength(3)
    expect(page1.total).toBe(5)
    expect(page2.runs).toHaveLength(2)
  })

  it('filters by project', async () => {
    await storage.createRun({ runId: 'r1', project: 'alpha', startedAt: '2026-04-02T10:00:00.000Z', status: 'passed' })
    await storage.createRun({ runId: 'r2', project: 'beta', startedAt: '2026-04-02T11:00:00.000Z', status: 'failed' })
    const result = await storage.listRuns({ page: 1, pageSize: 10, project: 'alpha' })
    expect(result.runs).toHaveLength(1)
    expect(result.runs[0].runId).toBe('r1')
    expect(result.total).toBe(1)
  })

  it('filters by status', async () => {
    await storage.createRun({ runId: 'r1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'passed' })
    await storage.createRun({ runId: 'r2', project: 'p', startedAt: '2026-04-02T11:00:00.000Z', status: 'failed' })
    const result = await storage.listRuns({ page: 1, pageSize: 10, status: 'failed' })
    expect(result.runs).toHaveLength(1)
    expect(result.runs[0].runId).toBe('r2')
  })

  it('returns aggregate stats scoped to the active filter', async () => {
    await storage.createRun({ runId: 'r1', project: 'alpha', startedAt: '2026-04-02T09:00:00.000Z', status: 'passed' })
    await storage.createRun({ runId: 'r2', project: 'alpha', startedAt: '2026-04-02T10:00:00.000Z', status: 'failed' })
    await storage.createRun({ runId: 'r3', project: 'beta',  startedAt: '2026-04-02T11:00:00.000Z', status: 'passed' })
    const result = await storage.listRuns({ page: 1, pageSize: 10, project: 'alpha' })
    expect(result.total).toBe(2)
    expect(result.totalPassed).toBe(1)
    expect(result.totalFailed).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: `listRuns` tests fail with TypeScript errors or wrong return shape.

- [ ] **Step 3: Implement new `listRuns()` in storage.ts**

Update imports at the top of `packages/server/src/runs/storage.ts`:

```ts
import type { SQL } from 'drizzle-orm'
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm'
```

Add the `RunsQuery` type and replace the existing `listRuns` function:

```ts
export type RunsQuery = {
  page: number
  pageSize: number
  project?: string
  branch?: string
  status?: string
}

export async function listRuns(
  query: RunsQuery,
): Promise<{ runs: RunRecord[]; total: number; totalPassed: number; totalFailed: number }> {
  const conditions: SQL[] = []
  if (query.project) conditions.push(eq(runs.project, query.project))
  if (query.branch) conditions.push(eq(runs.branch, query.branch))
  if (query.status) conditions.push(eq(runs.status, query.status as RunRecord['status']))
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [agg] = await db
    .select({
      total: count(),
      totalPassed: sql<number>`COUNT(*) FILTER (WHERE ${runs.status} = 'passed')`,
      totalFailed: sql<number>`COUNT(*) FILTER (WHERE ${runs.status} = 'failed')`,
    })
    .from(runs)
    .where(whereClause)

  const rows = await db
    .select()
    .from(runs)
    .where(whereClause)
    .orderBy(desc(runs.startedAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)

  return {
    runs: rows.map(toRunRecord),
    total: Number(agg?.total ?? 0),
    totalPassed: Number(agg?.totalPassed ?? 0),
    totalFailed: Number(agg?.totalFailed ?? 0),
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests pass (including the new listRuns tests)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/runs/storage.ts packages/server/src/runs/storage.test.ts
git commit -m "feat(storage): paginated listRuns with filters and aggregate stats"
```

---

## Task 4: Update GET /api/runs route + add GET /api/runs/meta

**Files:**
- Modify: `packages/server/src/runs/routes.ts`

- [ ] **Step 1: Replace `GET /` handler and add `GET /meta` (before `/:runId`)**

In `packages/server/src/runs/routes.ts`, replace the existing `runs.get('/', ...)` with:

```ts
runs.get('/meta', async (c) => {
  const projectRows = await db.selectDistinct({ project: runs.project }).from(runs)
  const branchRows = await db.selectDistinct({ branch: runs.branch }).from(runs)
  return c.json({
    projects: projectRows.map((r) => r.project).sort(),
    branches: branchRows
      .filter((r): r is { branch: string } => r.branch != null)
      .map((r) => r.branch)
      .sort(),
  })
})

runs.get('/', async (c) => {
  const page = Math.max(1, Number(c.req.query('page') ?? '1'))
  const rawPageSize = Number(c.req.query('pageSize') ?? '10')
  const pageSize = ([10, 25, 50, 100] as const).includes(rawPageSize as 10 | 25 | 50 | 100)
    ? (rawPageSize as 10 | 25 | 50 | 100)
    : 10
  const project = c.req.query('project') || undefined
  const branch = c.req.query('branch') || undefined
  const status = c.req.query('status') || undefined
  const result = await storage.listRuns({ page, pageSize, project, branch, status })
  return c.json({ ...result, page, pageSize })
})
```

**Important:** The `GET /meta` route MUST be registered before `GET /:runId`, otherwise Hono matches "meta" as a run ID. The `/meta` route above should be placed immediately after the `POST /` route and before `GET /:runId`.

Also add these two imports at the top of `packages/server/src/runs/routes.ts`, alongside the existing imports:

```ts
import { db } from '../db/client.js'
import { runs as runsSchema } from '../db/schema.js'
```

Note: `runs` is both the Hono router (already declared as `export const runs = new Hono<HonoEnv>()`) and a schema table. Import the schema table as `runsSchema` to avoid the conflict.

Then in the `/meta` handler use `runsSchema` instead of `runs`:

```ts
runs.get('/meta', async (c) => {
  const projectRows = await db.selectDistinct({ project: runsSchema.project }).from(runsSchema)
  const branchRows = await db.selectDistinct({ branch: runsSchema.branch }).from(runsSchema)
  return c.json({
    projects: projectRows.map((r) => r.project).sort(),
    branches: branchRows
      .filter((r): r is { branch: string } => r.branch != null)
      .map((r) => r.branch)
      .sort(),
  })
})
```

- [ ] **Step 2: Verify type-check**

```bash
pnpm --filter @playwright-cart/server exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run existing server tests**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/runs/routes.ts
git commit -m "feat(api): paginated GET /api/runs and new GET /api/runs/meta"
```

---

## Task 5: Update PATCH /api/users/me — accept `runsPerPage`

**Files:**
- Modify: `packages/server/src/users/routes.ts`

- [ ] **Step 1: Add `runsPerPage` handling to PATCH /me**

In `packages/server/src/users/routes.ts`, inside the `usersRouter.patch('/me', ...)` handler, make these changes:

1. Extend the body type to include `runsPerPage`:

```ts
const body = await c.req.json<{
  username?: unknown
  password?: unknown
  currentPassword?: unknown
  theme?: unknown
  runsPerPage?: unknown
}>()
```

2. Extend `updateData` type:

```ts
const updateData: Partial<{
  username: string
  passwordHash: string
  theme: 'dark' | 'light' | 'system'
  runsPerPage: number
}> = {}
```

3. Add validation block after the theme block:

```ts
if (body.runsPerPage !== undefined) {
  if (![10, 25, 50, 100].includes(body.runsPerPage as number)) {
    return c.json({ error: 'runsPerPage must be 10, 25, 50, or 100' }, 400)
  }
  updateData.runsPerPage = body.runsPerPage as number
}
```

4. Update the `.returning()` call to include `runsPerPage`:

```ts
;[updated] = await db.update(users).set(updateData).where(eq(users.id, authUser.id)).returning({
  id: users.id,
  username: users.username,
  role: users.role,
  theme: users.theme,
  runsPerPage: users.runsPerPage,
})
```

5. Update the `updated` variable type to include `runsPerPage`:

```ts
let updated:
  | { id: number; username: string; role: 'admin' | 'user'; theme: 'dark' | 'light' | 'system'; runsPerPage: number }
  | undefined
```

- [ ] **Step 2: Verify type-check**

```bash
pnpm --filter @playwright-cart/server exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/users/routes.ts
git commit -m "feat(users): accept runsPerPage in PATCH /api/users/me"
```

---

## Task 6: Frontend — update `api.ts`

**Files:**
- Modify: `packages/web/src/lib/api.ts`

- [ ] **Step 1: Update `CurrentUser`, `fetchRuns`, `updateMe`; add `fetchRunsMeta`**

Make the following changes in `packages/web/src/lib/api.ts`:

**Add `runsPerPage` to `CurrentUser`:**

```ts
export interface CurrentUser {
  id: number
  username: string
  role: UserRole
  theme: Theme
  runsPerPage: number
  expiresAt: number
}
```

**Add `RunsPage` type and update `fetchRuns`:**

```ts
export interface RunsPage {
  runs: RunRecord[]
  total: number
  totalPassed: number
  totalFailed: number
  page: number
  pageSize: number
}

export interface RunsParams {
  page: number
  pageSize: number
  project?: string
  branch?: string
  status?: string
}

export async function fetchRuns(params: RunsParams): Promise<RunsPage> {
  const query = new URLSearchParams()
  query.set('page', String(params.page))
  query.set('pageSize', String(params.pageSize))
  if (params.project) query.set('project', params.project)
  if (params.branch) query.set('branch', params.branch)
  if (params.status) query.set('status', params.status)
  const res = await fetch(`/api/runs?${query}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<RunsPage>
}
```

**Add `fetchRunsMeta`:**

```ts
export interface RunsMeta {
  projects: string[]
  branches: string[]
}

export async function fetchRunsMeta(): Promise<RunsMeta> {
  const res = await fetch('/api/runs/meta')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<RunsMeta>
}
```

**Update `updateMe` to accept `runsPerPage`:**

```ts
export async function updateMe(data: {
  username?: string
  password?: string
  currentPassword?: string
  theme?: string
  runsPerPage?: number
}): Promise<CurrentUser> {
  const res = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<CurrentUser>
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @playwright-cart/web exec tsc --noEmit
```

Expected: errors from `useRuns.ts`, `RunsPage.tsx` (callers of old `fetchRuns`) — fix in the next tasks

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/lib/api.ts
git commit -m "feat(api-client): update fetchRuns, updateMe, add fetchRunsMeta"
```

---

## Task 7: Update `useRuns` hook + add `useRunsMeta` hook

**Files:**
- Modify: `packages/web/src/hooks/useRuns.ts`
- Create: `packages/web/src/hooks/useRunsMeta.ts`

- [ ] **Step 1: Update `useRuns`**

Replace the entire content of `packages/web/src/hooks/useRuns.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { type RunsParams, fetchRuns } from '../lib/api.js'

export function useRuns(params: RunsParams) {
  return useQuery({
    queryKey: ['runs', params],
    queryFn: () => fetchRuns(params),
    staleTime: 30_000,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  })
}
```

(`placeholderData: (prev) => prev` keeps stale data visible during page transitions instead of showing a loading flash.)

- [ ] **Step 2: Create `useRunsMeta`**

Create `packages/web/src/hooks/useRunsMeta.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchRunsMeta } from '../lib/api.js'

export function useRunsMeta() {
  return useQuery({
    queryKey: ['runs-meta'],
    queryFn: fetchRunsMeta,
    staleTime: 5 * 60_000,
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/hooks/useRuns.ts packages/web/src/hooks/useRunsMeta.ts
git commit -m "feat(hooks): update useRuns for pagination, add useRunsMeta"
```

---

## Task 8: Update `StatsBar` — accept aggregate counts

**Files:**
- Modify: `packages/web/src/components/StatsBar.tsx`

- [ ] **Step 1: Replace `StatsBar` props and logic**

Replace the entire content of `packages/web/src/components/StatsBar.tsx`:

```ts
interface Props {
  total: number
  totalPassed: number
  totalFailed: number
}

export default function StatsBar({ total, totalPassed, totalFailed }: Props) {
  const passRate = total > 0 ? Math.round((totalPassed / total) * 100) : 0

  return (
    <div className="mb-6 flex items-baseline gap-0 divide-x divide-tn-border">
      <Stat value={total} label="runs" containerClassName="pr-6" className="text-tn-fg" />
      <Stat
        value={`${passRate}%`}
        label="pass rate"
        containerClassName="px-6"
        className="text-tn-green"
      />
      <Stat
        value={totalFailed}
        label="failed"
        containerClassName="pl-6"
        className={totalFailed > 0 ? 'text-tn-red' : 'text-tn-muted'}
      />
    </div>
  )
}

function Stat({
  value,
  label,
  className,
  containerClassName,
}: {
  value: string | number
  label: string
  className?: string
  containerClassName?: string
}) {
  return (
    <div className={`flex items-baseline gap-2 ${containerClassName ?? ''}`}>
      <span className={`font-display text-3xl font-bold tabular-nums leading-none ${className}`}>
        {value}
      </span>
      <span className="text-xs text-tn-muted">{label}</span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/StatsBar.tsx
git commit -m "refactor(StatsBar): accept aggregate counts instead of run array"
```

---

## Task 9: Update `FilterBar` — accept `projects`/`branches` props

**Files:**
- Modify: `packages/web/src/components/FilterBar.tsx`

- [ ] **Step 1: Replace props interface and remove internal derivation**

Replace the `Props` interface and the beginning of `FilterBar` in `packages/web/src/components/FilterBar.tsx`:

```ts
interface Props {
  projects: string[]
  branches: string[]
}

export function FilterBar({ projects, branches }: Props) {
  const [params, setParams] = useSearchParams()

  const project = params.get('project') ?? ''
  const branch = params.get('branch') ?? ''
  const status = params.get('status') ?? ''

  function setParam(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })
  }

  return (
    <div className="flex items-center gap-1">
      <FilterSelect label="Project" value={project} onChange={(v) => setParam('project', v)}>
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </FilterSelect>
      <span className="text-tn-border select-none">|</span>
      <FilterSelect label="Branch" value={branch} onChange={(v) => setParam('branch', v)}>
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </FilterSelect>
      <span className="text-tn-border select-none">|</span>
      <FilterSelect label="Status" value={status} onChange={(v) => setParam('status', v)}>
        <option value="">All statuses</option>
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </FilterSelect>
    </div>
  )
}
```

Keep `FilterSelect`, `applyFilters`, and `ALL_STATUSES` as-is. Remove the `runs` derivation lines (`const projects = ...`, `const branches = ...`).

Note: `applyFilters` is no longer used by RunsPage (filtering is now server-side), but keep it exported — it may be used elsewhere or by tests. Verify with `grep -r 'applyFilters'` before removing.

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/FilterBar.tsx
git commit -m "refactor(FilterBar): accept projects/branches props directly"
```

---

## Task 10: Update `RunsPage` — pagination state and UI

**Files:**
- Modify: `packages/web/src/pages/RunsPage.tsx`

- [ ] **Step 1: Replace RunsPage implementation**

Replace the entire `RunsPage` function body in `packages/web/src/pages/RunsPage.tsx`:

```ts
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { FilterBar } from '../components/FilterBar.js'
import RunsTable from '../components/RunsTable.js'
import StatsBar from '../components/StatsBar.js'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useRuns } from '../hooks/useRuns.js'
import { useRunsMeta } from '../hooks/useRunsMeta.js'
import { useSettings } from '../hooks/useSettings.js'
import { updateMe } from '../lib/api.js'

const PAGE_SIZES = [10, 25, 50, 100] as const
type PageSize = (typeof PAGE_SIZES)[number]

export default function RunsPage() {
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const { user, isAdmin } = useCurrentUser()
  const { data: settings } = useSettings()
  const { data: meta } = useRunsMeta()
  const retentionDays = settings?.data_retention_days ?? 90

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(10)

  // Sync pageSize from user preference once user data loads
  useEffect(() => {
    if (user?.runsPerPage && PAGE_SIZES.includes(user.runsPerPage as PageSize)) {
      setPageSize(user.runsPerPage as PageSize)
    }
  }, [user?.runsPerPage])

  // Reset to page 1 when filters change
  const project = params.get('project') || undefined
  const branch = params.get('branch') || undefined
  const status = params.get('status') || undefined

  useEffect(() => {
    setPage(1)
  }, [project, branch, status])

  const { data, isLoading, error, refetch } = useRuns({ page, pageSize, project, branch, status })

  async function handlePageSizeChange(size: PageSize) {
    setPageSize(size)
    setPage(1)
    try {
      await updateMe({ runsPerPage: size })
      queryClient.invalidateQueries({ queryKey: ['me'] })
    } catch {
      // best-effort: local state already updated
    }
  }

  if (isLoading && !data) return <Skeleton />

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

  if (!data || (data.total === 0 && !project && !branch && !status)) return <EmptyState />

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize))

  return (
    <div>
      {/* Page header: title left, page-size selector + filters right */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <h1 className="font-display text-lg font-bold uppercase tracking-[0.15em] text-tn-fg">
          Runs
        </h1>
        <div className="flex items-center gap-3">
          {/* Page size selector */}
          <div className="flex items-center gap-1">
            {PAGE_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => handlePageSizeChange(size)}
                className={[
                  'rounded px-2 py-1 font-display text-xs transition-colors',
                  pageSize === size
                    ? 'bg-tn-highlight text-tn-fg'
                    : 'text-tn-muted hover:text-tn-fg',
                ].join(' ')}
              >
                {size}
              </button>
            ))}
          </div>
          <span className="text-tn-border select-none">|</span>
          <FilterBar
            projects={meta?.projects ?? []}
            branches={meta?.branches ?? []}
          />
        </div>
      </div>

      {/* Stats strip */}
      <StatsBar
        total={data.total}
        totalPassed={data.totalPassed}
        totalFailed={data.totalFailed}
      />

      {/* Table */}
      <RunsTable
        runs={data.runs}
        isAdmin={isAdmin}
        retentionDays={retentionDays}
        onDeleteSuccess={() => refetch()}
      />

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between font-display text-xs text-tn-muted">
          <span>{data.total} runs</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-tn-border px-3 py-1.5 transition-colors hover:bg-tn-highlight disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-tn-border px-3 py-1.5 transition-colors hover:bg-tn-highlight disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

Keep the existing `Skeleton` and `EmptyState` function components unchanged.

Also remove the `applyFilters` import from FilterBar (no longer used in RunsPage).

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @playwright-cart/web exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/pages/RunsPage.tsx
git commit -m "feat(RunsPage): server-side pagination with page size selector"
```

---

## Task 11: Update `SettingsPage` — add RunsPerPage selector

**Files:**
- Modify: `packages/web/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add `RunsPerPageSelector` component and wire it into `AccountTab`**

In `packages/web/src/pages/SettingsPage.tsx`:

1. Update the `AccountTab` props to pass `runsPerPage`:

```ts
function AccountTab({ user }: { user: { id: number; username: string; theme: Theme; runsPerPage: number } }) {
  const queryClient = useQueryClient()

  return (
    <div className="space-y-10">
      <ChangeUsernameForm
        initialUsername={user.username}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['me'] })}
      />
      <ChangePasswordForm />
      <ThemeSelector onThemeChange={() => queryClient.invalidateQueries({ queryKey: ['me'] })} />
      <RunsPerPageSelector
        current={user.runsPerPage}
        onSave={() => queryClient.invalidateQueries({ queryKey: ['me'] })}
      />
    </div>
  )
}
```

2. Add the `RunsPerPageSelector` component after `ThemeSelector`:

```ts
const PAGE_SIZES = [10, 25, 50, 100] as const
type PageSize = (typeof PAGE_SIZES)[number]

function RunsPerPageSelector({
  current,
  onSave,
}: {
  current: number
  onSave: () => void
}) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')

  async function handleChange(size: PageSize) {
    setStatus('saving')
    setErrMsg('')
    try {
      await updateMe({ runsPerPage: size })
      setStatus('ok')
      onSave()
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Failed to save preference')
      setStatus('err')
    }
  }

  return (
    <section>
      <SectionHeading>Runs Per Page</SectionHeading>
      <div className="flex gap-2">
        {PAGE_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            disabled={status === 'saving'}
            onClick={() => handleChange(size)}
            className={[
              'flex items-center gap-2 rounded-lg border px-4 py-2 font-display text-sm transition-colors disabled:opacity-50',
              current === size
                ? 'border-tn-blue bg-tn-highlight text-tn-blue'
                : 'border-tn-border text-tn-muted hover:bg-tn-highlight hover:text-tn-fg',
            ].join(' ')}
          >
            {size}
          </button>
        ))}
      </div>
      {status === 'ok' && <p className="mt-2 font-mono text-xs text-tn-green">Saved.</p>}
      {status === 'err' && <p className="mt-2 font-mono text-xs text-tn-red">{errMsg}</p>}
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @playwright-cart/web exec tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/pages/SettingsPage.tsx
git commit -m "feat(settings): add Runs Per Page selector in Account tab"
```

---

## Verification

### Automated

```bash
# Server tests
pnpm --filter @playwright-cart/server test

# Type-check all packages
pnpm typecheck

# Lint
pnpm lint
```

All must pass with zero errors.

### Manual (requires full stack running)

```bash
docker-compose up   # or: pnpm dev in one terminal
```

1. **Default page size** — Log in as a fresh user → runs page shows 10 rows max
2. **Page navigation** — If more than 10 runs exist, Prev/Next buttons appear; clicking Next loads the next page
3. **Page size selector** — Click 25 in the header selector → table shows up to 25 rows; reload → preference persists
4. **Filter + pagination** — Apply a project filter → page resets to 1; stats show counts for filtered set only
5. **Settings page** — Open Settings → Account tab shows "Runs Per Page" with 4 buttons; clicking a value saves and the runs page reflects it immediately
6. **Filter dropdowns** — Project/branch dropdowns show all distinct values (not just current page's values)
7. **Empty filter result** — Apply a filter with no matching runs → table shows zero rows; stats show 0
