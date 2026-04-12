# Flaky Chip on Runs List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a yellow "↻ N flaky" chip on each run row in the Runs page when that run contains tests that passed only after retrying.

**Architecture:** Add `flakyCount` to the server's `listRuns` storage function via a batch subquery (one extra DB call per page, grouped by runId). Propagate the field through the frontend type and render a chip in `RunsTable` next to the existing status badge.

**Tech Stack:** Drizzle ORM (PostgreSQL), Hono, React 19, Tailwind (TokyoNight tokens), TypeScript

---

## Files

| File | Change |
|------|--------|
| `packages/server/src/runs/storage.ts` | Add `flakyCount?: number` to `RunRecord`; add batch flaky-count query to `listRuns` |
| `packages/server/src/runs/storage.test.ts` | Add `listRuns` tests for `flakyCount` |
| `packages/web/src/lib/api.ts` | Add `flakyCount?: number` to `RunRecord` |
| `packages/web/src/components/RunsTable.tsx` | Render flaky chip in Status column |

---

### Task 1: Server — compute `flakyCount` in `listRuns`

**Files:**
- Modify: `packages/server/src/runs/storage.ts`
- Test: `packages/server/src/runs/storage.test.ts`

A test is flaky when `retry > 0 AND status = 'passed'`. Each retry attempt is a distinct row (unique on `runId, testId`), so this is a straight COUNT filter.

- [ ] **Step 1.1: Add failing tests for `flakyCount` in `listRuns`**

Open `packages/server/src/runs/storage.test.ts` and add a new `describe` block after the existing `listRuns` block (after line 165):

```typescript
describe('listRuns — flakyCount', () => {
  async function makeRun(runId: string) {
    await storage.createRun({
      runId,
      project: 'p',
      startedAt: new Date().toISOString(),
      status: 'passed',
    })
  }

  async function makeTest(runId: string, testId: string, retry: number, status: storage.TestRecord['status']) {
    await storage.writeTestResult(runId, {
      testId,
      title: testId,
      titlePath: [testId],
      location: { file: 'test.spec.ts', line: 1, column: 1 },
      status,
      duration: 100,
      errors: [],
      retry,
      annotations: [],
      attachments: [],
    })
  }

  it('returns flakyCount 0 when run has no tests', async () => {
    await makeRun('run-a')
    const result = await storage.listRuns({ page: 1, pageSize: 10 })
    expect(result.runs[0].flakyCount).toBe(0)
  })

  it('returns flakyCount 0 when all tests passed on first attempt', async () => {
    await makeRun('run-a')
    await makeTest('run-a', 'test-1', 0, 'passed')
    await makeTest('run-a', 'test-2', 0, 'passed')
    const result = await storage.listRuns({ page: 1, pageSize: 10 })
    expect(result.runs[0].flakyCount).toBe(0)
  })

  it('returns flakyCount equal to number of retry-passed tests', async () => {
    await makeRun('run-a')
    await makeTest('run-a', 'test-1--r0', 0, 'failed')   // first attempt failed
    await makeTest('run-a', 'test-1--r1', 1, 'passed')   // retry passed → flaky
    await makeTest('run-a', 'test-2', 0, 'passed')        // clean pass, not flaky
    const result = await storage.listRuns({ page: 1, pageSize: 10 })
    expect(result.runs[0].flakyCount).toBe(1)
  })

  it('returns flakyCount 0 when retry attempt also failed', async () => {
    await makeRun('run-a')
    await makeTest('run-a', 'test-1--r0', 0, 'failed')
    await makeTest('run-a', 'test-1--r1', 1, 'failed')   // retry also failed → not flaky
    const result = await storage.listRuns({ page: 1, pageSize: 10 })
    expect(result.runs[0].flakyCount).toBe(0)
  })

  it('scopes flakyCount per run, not globally', async () => {
    await makeRun('run-a')
    await makeRun('run-b')
    await makeTest('run-a', 'test-1--r1', 1, 'passed')  // flaky in run-a
    await makeTest('run-b', 'test-2', 0, 'passed')       // clean in run-b
    const result = await storage.listRuns({ page: 1, pageSize: 10 })
    // runs sorted desc by startedAt, but both created at ~same time; just find by runId
    const a = result.runs.find((r) => r.runId === 'run-a')!
    const b = result.runs.find((r) => r.runId === 'run-b')!
    expect(a.flakyCount).toBe(1)
    expect(b.flakyCount).toBe(0)
  })
})
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd /home/radek/repos/personal/playwright-cart
pnpm --filter @playwright-cart/server test
```

Expected: new tests fail with `TypeError: Cannot read properties of undefined` or `expected undefined to be 0` (because `flakyCount` doesn't exist yet).

- [ ] **Step 1.3: Add `flakyCount` to `RunRecord` interface**

In `packages/server/src/runs/storage.ts`, update the `RunRecord` interface (around line 12):

```typescript
export interface RunRecord {
  runId: string
  project: string
  branch?: string
  commitSha?: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'passed' | 'failed' | 'interrupted' | 'timedOut'
  reportUrl?: string
  flakyCount?: number
}
```

- [ ] **Step 1.4: Add `gt` to the Drizzle import**

In `packages/server/src/runs/storage.ts`, line 4, add `gt` to the existing import:

```typescript
import { and, count, desc, eq, gt, inArray, sql } from 'drizzle-orm'
```

- [ ] **Step 1.5: Update `listRuns` to compute `flakyCount`**

Replace the `return` block of `listRuns` (currently lines ~134-148) with:

```typescript
  const rows = await db
    .select()
    .from(runs)
    .where(whereClause)
    .orderBy(desc(runs.startedAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)

  const runIds = rows.map((r) => r.runId)
  const flakyCounts =
    runIds.length > 0
      ? await db
          .select({ runId: tests.runId, flakyCount: count() })
          .from(tests)
          .where(and(inArray(tests.runId, runIds), gt(tests.retry, 0), eq(tests.status, 'passed')))
          .groupBy(tests.runId)
      : []
  const flakyMap = new Map(flakyCounts.map((r) => [r.runId, r.flakyCount]))

  return {
    runs: rows.map((row) => ({ ...toRunRecord(row), flakyCount: flakyMap.get(row.runId) ?? 0 })),
    total: Number(agg?.total ?? 0),
    totalPassed: Number(agg?.totalPassed ?? 0),
    totalFailed: Number(agg?.totalFailed ?? 0),
  }
```

- [ ] **Step 1.6: Run tests to verify they pass**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests pass including the new `listRuns — flakyCount` suite.

- [ ] **Step 1.7: Commit**

```bash
git add packages/server/src/runs/storage.ts packages/server/src/runs/storage.test.ts
git commit -m "feat(server): add flakyCount to listRuns response"
```

---

### Task 2: Frontend types — add `flakyCount` to `RunRecord`

**Files:**
- Modify: `packages/web/src/lib/api.ts`

- [ ] **Step 2.1: Add `flakyCount` to the web `RunRecord` interface**

In `packages/web/src/lib/api.ts`, update the `RunRecord` interface (around line 16):

```typescript
export interface RunRecord {
  runId: string
  project: string
  branch?: string
  commitSha?: string
  startedAt: string
  completedAt?: string
  status: RunStatus
  reportUrl?: string
  flakyCount?: number
}
```

- [ ] **Step 2.2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 2.3: Commit**

```bash
git add packages/web/src/lib/api.ts
git commit -m "feat(web): add flakyCount to RunRecord type"
```

---

### Task 3: Frontend UI — render flaky chip in RunsTable

**Files:**
- Modify: `packages/web/src/components/RunsTable.tsx`

The chip style follows the existing TokyoNight yellow used for flakiness throughout the app (`bg-tn-yellow/15 text-tn-yellow`). The ↻ character signals retried tests.

- [ ] **Step 3.1: Update the Status column cell**

In `packages/web/src/components/RunsTable.tsx`, replace the Status `<td>` (around line 141-143):

```tsx
<td className="px-4 py-3">
  <div className="flex flex-col gap-1">
    <StatusBadge status={run.status} />
    {(run.flakyCount ?? 0) > 0 && (
      <span className="inline-flex items-center gap-1 rounded-full bg-tn-yellow/15 px-2 py-0.5 font-display text-xs font-semibold text-tn-yellow">
        ↻ {run.flakyCount} flaky
      </span>
    )}
  </div>
</td>
```

- [ ] **Step 3.2: Run typecheck and lint**

```bash
pnpm typecheck
pnpm lint
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add packages/web/src/components/RunsTable.tsx
git commit -m "feat(web): show flaky chip on run rows in RunsTable"
```

---

### Task 4: End-to-end verification

- [ ] **Step 4.1: Run the full test suite**

```bash
pnpm --filter @playwright-cart/server test
pnpm typecheck
pnpm lint
```

Expected: all pass, zero errors.

- [ ] **Step 4.2: Smoke-test in browser**

Start the dev stack:
```bash
pnpm dev
```

Navigate to `http://localhost:5173` and check the Runs page:
- Runs that had retried+passed tests show a yellow "↻ N flaky" chip below their status badge
- Runs with no flaky tests show no chip
- The status badge itself is unchanged
