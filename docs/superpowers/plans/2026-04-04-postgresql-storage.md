# PostgreSQL Storage Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace file-system JSON storage in `packages/server` with PostgreSQL via Drizzle ORM, keeping the same public API surface and all binary files (attachments, HTML reports) on disk.

**Architecture:** A new `src/db/` module holds the Drizzle schema, connection client, and migration runner. `storage.ts` is rewritten in-place — same exported function signatures, now async, using Drizzle queries instead of `fs.*` calls. `routes.ts` gets only `await` additions. All binary file handling (attachments, HTML reports) remains on disk unchanged.

**Tech Stack:** Drizzle ORM `^0.36.0`, `drizzle-kit ^0.27.0`, `pg ^8.11.0`, PostgreSQL 17, Vitest (existing)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `packages/server/src/db/schema.ts` | Drizzle table + enum definitions |
| Create | `packages/server/src/db/client.ts` | pg Pool + drizzle() instance, reads DATABASE_URL |
| Create | `packages/server/src/db/migrate.ts` | Runs pending SQL migrations at startup |
| Create | `packages/server/src/db/test-utils.ts` | `resetDb()` helper for test teardown |
| Create | `packages/server/src/db/migrations/` | SQL migration files (generated, committed) |
| Create | `packages/server/drizzle.config.ts` | drizzle-kit config |
| Modify | `packages/server/package.json` | Add drizzle-orm, pg, @types/pg, drizzle-kit |
| Rewrite | `packages/server/src/runs/storage.ts` | Same exports, Drizzle queries instead of fs.* |
| Modify | `packages/server/src/runs/storage.test.ts` | Async + DB setup/teardown |
| Modify | `packages/server/src/runs/routes.ts` | Add await to all storage calls |
| Modify | `packages/server/src/runs/routes.test.ts` | Async + DB setup/teardown |
| Modify | `packages/server/src/index.ts` | Call runMigrations() before serve() |
| Modify | `docker-compose.yml` | Add postgres:17 service + db_data volume |
| Modify | `.env.example` | Add DATABASE_URL |
| Modify | `README.md` | Document new env var and deployment |
| Modify | `CLAUDE.md` | Update architecture section |

---

## Task 1: Install Dependencies and Create Drizzle Config

**Files:**
- Modify: `packages/server/package.json`
- Create: `packages/server/drizzle.config.ts`

- [ ] **Step 1: Add dependencies to package.json**

Edit `packages/server/package.json` so `"dependencies"` and `"devDependencies"` read:

```json
{
  "name": "@playwright-cart/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.7",
    "adm-zip": "^0.5.17",
    "drizzle-orm": "^0.36.0",
    "hono": "^4.6.20",
    "pg": "^8.11.0"
  },
  "devDependencies": {
    "@types/adm-zip": "^0.5.8",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.10.0",
    "drizzle-kit": "^0.27.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.3",
    "vitest": "^4.1.2"
  }
}
```

- [ ] **Step 2: Install packages**

```bash
pnpm install
```

Expected: no errors, `node_modules` updated.

- [ ] **Step 3: Create drizzle.config.ts**

Create `packages/server/drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://playwright_cart:playwright_cart@localhost:5432/playwright_cart',
  },
})
```

- [ ] **Step 4: Commit**

```bash
cd packages/server
git add package.json drizzle.config.ts ../../pnpm-lock.yaml
git commit -m "chore(server): add drizzle-orm, pg, drizzle-kit dependencies"
```

---

## Task 2: Create the Drizzle Schema

**Files:**
- Create: `packages/server/src/db/schema.ts`

- [ ] **Step 1: Create `src/db/` directory and write schema**

Create `packages/server/src/db/schema.ts`:

```typescript
import {
  bigint,
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const runStatusEnum = pgEnum('run_status', [
  'running',
  'passed',
  'failed',
  'interrupted',
  'timedOut',
])

export const testStatusEnum = pgEnum('test_status', [
  'passed',
  'failed',
  'timedOut',
  'skipped',
  'interrupted',
])

export const runs = pgTable(
  'runs',
  {
    runId: text('run_id').primaryKey(),
    project: text('project').notNull(),
    branch: text('branch'),
    commitSha: text('commit_sha'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    status: runStatusEnum('status').notNull().default('running'),
    reportUrl: text('report_url'),
  },
  (t) => [index('runs_started_at_idx').on(t.startedAt)],
)

export const tests = pgTable(
  'tests',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    testId: text('test_id').notNull(),
    runId: text('run_id')
      .notNull()
      .references(() => runs.runId, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    titlePath: text('title_path').array().notNull(),
    locationFile: text('location_file').notNull(),
    locationLine: integer('location_line').notNull(),
    locationCol: integer('location_col').notNull(),
    status: testStatusEnum('status').notNull(),
    durationMs: integer('duration_ms').notNull(),
    retry: integer('retry').notNull().default(0),
  },
  (t) => [
    uniqueIndex('tests_run_test_uniq').on(t.runId, t.testId),
    index('tests_run_id_idx').on(t.runId),
  ],
)

export const testErrors = pgTable('test_errors', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  testPk: bigint('test_pk', { mode: 'number' })
    .notNull()
    .references(() => tests.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  message: text('message').notNull(),
  stack: text('stack'),
})

export const testAnnotations = pgTable('test_annotations', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  testPk: bigint('test_pk', { mode: 'number' })
    .notNull()
    .references(() => tests.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  type: text('type').notNull(),
  description: text('description'),
})

export const testAttachments = pgTable('test_attachments', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  testPk: bigint('test_pk', { mode: 'number' })
    .notNull()
    .references(() => tests.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  filename: text('filename'),
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @playwright-cart/server typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/db/schema.ts
git commit -m "feat(server/db): add drizzle schema — runs, tests, errors, annotations, attachments"
```

---

## Task 3: Generate Initial Migration

**Files:**
- Create: `packages/server/src/db/migrations/` (generated)

- [ ] **Step 1: Ensure a local PostgreSQL is running**

If using Docker Compose:
```bash
docker compose up postgres -d
```

Or start your local PostgreSQL service. The default DATABASE_URL from drizzle.config.ts is `postgresql://playwright_cart:playwright_cart@localhost:5432/playwright_cart`.

Create the database if it doesn't exist yet:
```bash
docker compose exec postgres psql -U playwright_cart -c "SELECT 1" playwright_cart 2>/dev/null \
  || docker compose exec postgres createdb -U playwright_cart playwright_cart
```

- [ ] **Step 2: Generate the SQL migration**

```bash
pnpm --filter @playwright-cart/server db:generate
```

Expected output: something like `[✓] 1 migration file created: src/db/migrations/0000_<name>.sql`

- [ ] **Step 3: Inspect the generated file**

Open the generated `.sql` file in `packages/server/src/db/migrations/`. It should contain:

- `CREATE TYPE "public"."run_status" AS ENUM(...)`
- `CREATE TYPE "public"."test_status" AS ENUM(...)`
- `CREATE TABLE "runs" (...)`
- `CREATE TABLE "tests" (...)`
- `CREATE TABLE "test_errors" (...)`
- `CREATE TABLE "test_annotations" (...)`
- `CREATE TABLE "test_attachments" (...)`
- All `CREATE INDEX` and `CREATE UNIQUE INDEX` statements

If anything looks wrong, do not proceed — check the schema.ts for errors.

- [ ] **Step 4: Commit the migration**

```bash
git add packages/server/src/db/migrations/
git commit -m "feat(server/db): add initial schema migration"
```

---

## Task 4: Create DB Client and Migration Runner

**Files:**
- Create: `packages/server/src/db/client.ts`
- Create: `packages/server/src/db/migrate.ts`

- [ ] **Step 1: Create the DB client**

Create `packages/server/src/db/client.ts`:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL environment variable is not set')

const pool = new Pool({ connectionString: url })

export const db = drizzle(pool, { schema })

export async function closeDb(): Promise<void> {
  await pool.end()
}
```

- [ ] **Step 2: Create the migration runner**

Create `packages/server/src/db/migrate.ts`:

```typescript
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is not set')

  const pool = new Pool({ connectionString: url })
  const db = drizzle(pool)
  try {
    await migrate(db, { migrationsFolder: join(__dirname, 'migrations') })
    console.log('[playwright-cart/server] DB migrations applied')
  } finally {
    await pool.end()
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @playwright-cart/server typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/db/client.ts packages/server/src/db/migrate.ts
git commit -m "feat(server/db): add db client and migration runner"
```

---

## Task 5: Create Test Database Utilities

**Files:**
- Create: `packages/server/src/db/test-utils.ts`

- [ ] **Step 1: Write the resetDb helper**

Create `packages/server/src/db/test-utils.ts`:

```typescript
import { sql } from 'drizzle-orm'
import { db } from './client.js'

/**
 * Truncate all application tables in dependency order.
 * Call in beforeEach to get a clean slate between tests.
 */
export async function resetDb(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE test_errors, test_annotations, test_attachments, tests, runs RESTART IDENTITY CASCADE`,
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @playwright-cart/server typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/db/test-utils.ts
git commit -m "feat(server/db): add test-utils with resetDb helper"
```

---

## Task 6: Rewrite storage.test.ts (Failing Tests First)

**Files:**
- Modify: `packages/server/src/runs/storage.test.ts`

> **Prerequisite:** `DATABASE_URL` must be set in your shell pointing at a local dev/test PostgreSQL. Example:
> ```bash
> export DATABASE_URL=postgresql://playwright_cart:playwright_cart@localhost:5432/playwright_cart
> ```

- [ ] **Step 1: Rewrite storage.test.ts**

Replace the entire file contents of `packages/server/src/runs/storage.test.ts`:

```typescript
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeDb } from '../db/client.js'
import { runMigrations } from '../db/migrate.js'
import { resetDb } from '../db/test-utils.js'
import * as storage from './storage.js'

let testDir: string

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  testDir = join(tmpdir(), `pct-test-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
  storage.storageConfig.dataDir = testDir
  await resetDb()
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

afterAll(async () => {
  await closeDb()
})

describe('createRun / getRun', () => {
  it('persists and retrieves a run record', async () => {
    const run: storage.RunRecord = {
      runId: 'my-project-123',
      project: 'my-project',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    }
    await storage.createRun(run)
    expect(await storage.getRun('my-project-123')).toEqual(run)
  })

  it('returns null for a missing run', async () => {
    expect(await storage.getRun('not-exist')).toBeNull()
  })
})

describe('updateRun', () => {
  it('merges partial updates into the existing record', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    await storage.updateRun('run-1', { status: 'passed', completedAt: '2026-04-02T10:01:00.000Z' })
    const run = await storage.getRun('run-1')
    expect(run?.status).toBe('passed')
    expect(run?.completedAt).toBe('2026-04-02T10:01:00.000Z')
    expect(run?.project).toBe('p')
  })
})

describe('listRuns', () => {
  it('returns an empty array when no runs exist', async () => {
    expect(await storage.listRuns()).toEqual([])
  })

  it('returns runs sorted by startedAt descending', async () => {
    await storage.createRun({
      runId: 'a',
      project: 'p',
      startedAt: '2026-04-02T09:00:00.000Z',
      status: 'running',
    })
    await storage.createRun({
      runId: 'b',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const runs = await storage.listRuns()
    expect(runs[0].runId).toBe('b')
    expect(runs[1].runId).toBe('a')
  })
})

describe('writeTestResult / getTestResults', () => {
  it('stores and retrieves test results including nested arrays', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const test: storage.TestRecord = {
      testId: 'suite--my-test',
      title: 'my test',
      titlePath: ['suite', 'my test'],
      location: { file: 'test.spec.ts', line: 10, column: 1 },
      status: 'passed',
      duration: 500,
      errors: [],
      retry: 0,
      annotations: [],
      attachments: [],
    }
    await storage.writeTestResult('run-1', test)
    expect(await storage.getTestResults('run-1')).toEqual([test])
  })

  it('preserves errors, annotations, and attachments', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const test: storage.TestRecord = {
      testId: 'failing-test',
      title: 'failing test',
      titlePath: ['suite', 'failing test'],
      location: { file: 'test.spec.ts', line: 20, column: 1 },
      status: 'failed',
      duration: 1000,
      errors: [{ message: 'Expected true to be false', stack: 'Error at line 20' }],
      retry: 1,
      annotations: [{ type: '@bug', description: 'known issue' }],
      attachments: [{ name: 'screenshot', contentType: 'image/png', filename: 'shot.png' }],
    }
    await storage.writeTestResult('run-1', test)
    const results = await storage.getTestResults('run-1')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual(test)
  })
})

describe('getTestResult', () => {
  it('returns null for a missing test', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    expect(await storage.getTestResult('run-1', 'no-such-test')).toBeNull()
  })

  it('returns the specific test by runId + testId', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const test: storage.TestRecord = {
      testId: 'my-test',
      title: 'my test',
      titlePath: ['my test'],
      location: { file: 'a.spec.ts', line: 1, column: 1 },
      status: 'passed',
      duration: 100,
      errors: [],
      retry: 0,
      annotations: [],
      attachments: [],
    }
    await storage.writeTestResult('run-1', test)
    expect(await storage.getTestResult('run-1', 'my-test')).toEqual(test)
  })
})
```

- [ ] **Step 2: Run the tests — expect them to fail**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: tests FAIL because `storage.createRun`, `storage.getRun`, etc. are still synchronous.

- [ ] **Step 3: Commit the failing tests**

```bash
git add packages/server/src/runs/storage.test.ts
git commit -m "test(server): update storage tests for async DB — currently failing"
```

---

## Task 7: Rewrite storage.ts with Drizzle

**Files:**
- Rewrite: `packages/server/src/runs/storage.ts`

- [ ] **Step 1: Replace the file contents**

Replace the entire file `packages/server/src/runs/storage.ts`:

```typescript
import { and, desc, eq, inArray } from 'drizzle-orm'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../db/client.js'
import {
  testAnnotations,
  testAttachments,
  testErrors,
  tests,
  runs,
} from '../db/schema.js'

export const storageConfig = {
  dataDir: process.env.DATA_DIR ?? './data',
}

export interface RunRecord {
  runId: string
  project: string
  branch?: string
  commitSha?: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'passed' | 'failed' | 'interrupted' | 'timedOut'
  reportUrl?: string
}

export interface TestRecord {
  testId: string
  title: string
  titlePath: string[]
  location: { file: string; line: number; column: number }
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
  duration: number
  errors: Array<{ message: string; stack?: string }>
  retry: number
  annotations: Array<{ type: string; description?: string }>
  attachments: Array<{ name: string; contentType: string; filename?: string }>
}

// ---------- helpers ----------

function toRunRecord(row: typeof runs.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    project: row.project,
    ...(row.branch != null && { branch: row.branch }),
    ...(row.commitSha != null && { commitSha: row.commitSha }),
    startedAt: row.startedAt.toISOString(),
    ...(row.completedAt != null && { completedAt: row.completedAt.toISOString() }),
    status: row.status,
    ...(row.reportUrl != null && { reportUrl: row.reportUrl }),
  }
}

function assembleTestRecord(
  row: typeof tests.$inferSelect,
  errors: (typeof testErrors.$inferSelect)[],
  annotations: (typeof testAnnotations.$inferSelect)[],
  attachments: (typeof testAttachments.$inferSelect)[],
): TestRecord {
  return {
    testId: row.testId,
    title: row.title,
    titlePath: row.titlePath as string[],
    location: { file: row.locationFile, line: row.locationLine, column: row.locationCol },
    status: row.status,
    duration: row.durationMs,
    retry: row.retry,
    errors: errors
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ message: e.message, ...(e.stack != null && { stack: e.stack }) })),
    annotations: annotations
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ type: a.type, ...(a.description != null && { description: a.description }) })),
    attachments: attachments
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        name: a.name,
        contentType: a.contentType,
        ...(a.filename != null && { filename: a.filename }),
      })),
  }
}

// ---------- run operations ----------

export async function createRun(run: RunRecord): Promise<void> {
  await db.insert(runs).values({
    runId: run.runId,
    project: run.project,
    branch: run.branch,
    commitSha: run.commitSha,
    startedAt: new Date(run.startedAt),
    status: run.status,
  })
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  const [row] = await db.select().from(runs).where(eq(runs.runId, runId))
  return row ? toRunRecord(row) : null
}

export async function updateRun(runId: string, update: Partial<RunRecord>): Promise<void> {
  const values: Partial<typeof runs.$inferInsert> = {}
  if (update.status != null) values.status = update.status
  if (update.reportUrl != null) values.reportUrl = update.reportUrl
  if (update.completedAt != null) values.completedAt = new Date(update.completedAt)
  if (Object.keys(values).length === 0) return
  await db.update(runs).set(values).where(eq(runs.runId, runId))
}

export async function listRuns(): Promise<RunRecord[]> {
  const rows = await db.select().from(runs).orderBy(desc(runs.startedAt))
  return rows.map(toRunRecord)
}

// ---------- test operations ----------

export async function writeTestResult(runId: string, test: TestRecord): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ id: testPk }] = await tx
      .insert(tests)
      .values({
        testId: test.testId,
        runId,
        title: test.title,
        titlePath: test.titlePath,
        locationFile: test.location.file,
        locationLine: test.location.line,
        locationCol: test.location.column,
        status: test.status,
        durationMs: test.duration,
        retry: test.retry,
      })
      .returning({ id: tests.id })

    if (test.errors.length > 0) {
      await tx.insert(testErrors).values(
        test.errors.map((e, i) => ({
          testPk,
          position: i,
          message: e.message,
          stack: e.stack,
        })),
      )
    }

    if (test.annotations.length > 0) {
      await tx.insert(testAnnotations).values(
        test.annotations.map((a, i) => ({
          testPk,
          position: i,
          type: a.type,
          description: a.description,
        })),
      )
    }

    if (test.attachments.length > 0) {
      await tx.insert(testAttachments).values(
        test.attachments.map((a, i) => ({
          testPk,
          position: i,
          name: a.name,
          contentType: a.contentType,
          filename: a.filename,
        })),
      )
    }
  })
}

export async function getTestResult(runId: string, testId: string): Promise<TestRecord | null> {
  const [row] = await db
    .select()
    .from(tests)
    .where(and(eq(tests.runId, runId), eq(tests.testId, testId)))
  if (!row) return null

  const [errors, annotations, attachments] = await Promise.all([
    db.select().from(testErrors).where(eq(testErrors.testPk, row.id)),
    db.select().from(testAnnotations).where(eq(testAnnotations.testPk, row.id)),
    db.select().from(testAttachments).where(eq(testAttachments.testPk, row.id)),
  ])

  return assembleTestRecord(row, errors, annotations, attachments)
}

export async function getTestResults(runId: string): Promise<TestRecord[]> {
  const testRows = await db.select().from(tests).where(eq(tests.runId, runId))
  if (testRows.length === 0) return []

  const ids = testRows.map((r) => r.id)
  const [errors, annotations, attachments] = await Promise.all([
    db.select().from(testErrors).where(inArray(testErrors.testPk, ids)),
    db.select().from(testAnnotations).where(inArray(testAnnotations.testPk, ids)),
    db.select().from(testAttachments).where(inArray(testAttachments.testPk, ids)),
  ])

  return testRows.map((row) =>
    assembleTestRecord(
      row,
      errors.filter((e) => e.testPk === row.id),
      annotations.filter((a) => a.testPk === row.id),
      attachments.filter((a) => a.testPk === row.id),
    ),
  )
}

// ---------- filesystem helpers (binary files remain on disk) ----------

export function getAttachmentsDir(runId: string, testId: string): string {
  const dir = join(storageConfig.dataDir, runId, 'attachments', testId)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getReportDir(runId: string): string {
  const dir = join(storageConfig.dataDir, runId, 'report')
  mkdirSync(dir, { recursive: true })
  return dir
}
```

- [ ] **Step 2: Run storage tests — expect them to pass**

```bash
pnpm --filter @playwright-cart/server test -- --reporter=verbose src/runs/storage.test.ts
```

Expected: all tests in `storage.test.ts` PASS.

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @playwright-cart/server typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/runs/storage.ts
git commit -m "feat(server): replace filesystem storage with drizzle/postgresql"
```

---

## Task 8: Update routes.ts (Add Await)

**Files:**
- Modify: `packages/server/src/runs/routes.ts`

- [ ] **Step 1: Make all storage calls async**

Replace the entire file `packages/server/src/runs/routes.ts`:

```typescript
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { Hono } from 'hono'
import { type RunEvent, runEmitter } from '../events.js'
import * as storage from './storage.js'

export const runs = new Hono()

runs.post('/', async (c) => {
  const body = await c.req.json<{
    project: string
    branch?: string
    commitSha?: string
    startedAt: string
  }>()
  const slug = body.project.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const runId = `${slug}-${Date.now()}`
  const run: storage.RunRecord = {
    runId,
    project: body.project,
    branch: body.branch,
    commitSha: body.commitSha,
    startedAt: body.startedAt,
    status: 'running',
  }
  await storage.createRun(run)
  runEmitter.emit('event', { type: 'run:created', runId } satisfies RunEvent)
  return c.json({ runId }, 201)
})

runs.get('/', async (c) => {
  return c.json(await storage.listRuns())
})

runs.get('/:runId', async (c) => {
  const run = await storage.getRun(c.req.param('runId'))
  if (!run) return c.json({ error: 'Not found' }, 404)
  const tests = await storage.getTestResults(c.req.param('runId'))
  return c.json({ ...run, tests })
})

runs.get('/:runId/tests/:testId', async (c) => {
  const { runId, testId } = c.req.param()
  const run = await storage.getRun(runId)
  if (!run) return c.json({ error: 'Not found' }, 404)
  const test = await storage.getTestResult(runId, testId)
  if (!test) return c.json({ error: 'Not found' }, 404)
  return c.json(test)
})

runs.post('/:runId/complete', async (c) => {
  const runId = c.req.param('runId')
  const { completedAt, status } = await c.req.json<{
    completedAt: string
    status: storage.RunRecord['status']
  }>()
  await storage.updateRun(runId, { completedAt, status })
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)
  return c.json({})
})

runs.post('/:runId/tests', async (c) => {
  const runId = c.req.param('runId')
  const body = await c.req.parseBody()
  const metadata = JSON.parse(body.metadata as string) as storage.TestRecord
  const attachmentsDir = storage.getAttachmentsDir(runId, metadata.testId)

  for (let i = 0; ; i++) {
    const file = body[`attachment_${i}`]
    if (!file) break
    if (file instanceof File) {
      const buf = Buffer.from(await file.arrayBuffer())
      writeFileSync(join(attachmentsDir, file.name), buf)
    }
  }

  await storage.writeTestResult(runId, metadata)
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)
  return c.json({ testId: metadata.testId }, 201)
})

runs.post('/:runId/report', async (c) => {
  const runId = c.req.param('runId')
  const body = await c.req.parseBody()
  const reportFile = body.report as File
  const completedAt = body.completedAt as string
  const status = body.status as storage.RunRecord['status']

  const zipBuf = Buffer.from(await reportFile.arrayBuffer())
  const zip = new AdmZip(zipBuf)
  zip.extractAllTo(storage.getReportDir(runId), true)

  const reportUrl = `/reports/${runId}/report/index.html`
  await storage.updateRun(runId, { completedAt, status, reportUrl })
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)

  return c.json({ reportUrl })
})
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @playwright-cart/server typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/runs/routes.ts
git commit -m "feat(server): make route handlers await async storage functions"
```

---

## Task 9: Update routes.test.ts (Failing Tests First)

**Files:**
- Modify: `packages/server/src/runs/routes.test.ts`

- [ ] **Step 1: Rewrite routes.test.ts**

Replace the entire file `packages/server/src/runs/routes.test.ts`:

```typescript
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDb } from '../db/client.js'
import { runMigrations } from '../db/migrate.js'
import { resetDb } from '../db/test-utils.js'
import { runEmitter } from '../events.js'
import { runs } from './routes.js'
import * as storage from './storage.js'

let testDir: string

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  testDir = join(tmpdir(), `pct-routes-test-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
  storage.storageConfig.dataDir = testDir
  await resetDb()
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

afterAll(async () => {
  await closeDb()
})

describe('POST /api/runs', () => {
  it('creates a run and returns a runId', async () => {
    const res = await runs.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'my-app', startedAt: '2026-04-02T10:00:00.000Z' }),
    })
    expect(res.status).toBe(201)
    const { runId } = (await res.json()) as { runId: string }
    expect(runId).toMatch(/^my-app-\d+$/)
    expect(await storage.getRun(runId)).not.toBeNull()
  })

  it('includes branch and commitSha when provided', async () => {
    const res = await runs.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'proj',
        startedAt: '2026-04-02T10:00:00.000Z',
        branch: 'main',
        commitSha: 'abc123',
      }),
    })
    const { runId } = (await res.json()) as { runId: string }
    const run = await storage.getRun(runId)
    expect(run?.branch).toBe('main')
    expect(run?.commitSha).toBe('abc123')
  })

  it('emits run:created with the new runId', async () => {
    const spy = vi.spyOn(runEmitter, 'emit')
    await runs.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'my-app', startedAt: '2026-04-04T10:00:00.000Z' }),
    })
    expect(spy).toHaveBeenCalledWith('event', expect.objectContaining({ type: 'run:created' }))
    spy.mockRestore()
  })
})

describe('GET /api/runs', () => {
  it('returns an empty array when no runs exist', async () => {
    const res = await runs.request('/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns existing runs', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const res = await runs.request('/')
    const body = (await res.json()) as storage.RunRecord[]
    expect(body).toHaveLength(1)
    expect(body[0].runId).toBe('run-1')
  })
})

describe('GET /api/runs/:runId', () => {
  it('returns 404 for a missing run', async () => {
    const res = await runs.request('/no-such-run')
    expect(res.status).toBe(404)
  })

  it('returns run with test results', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    await storage.writeTestResult('run-1', {
      testId: 'my-test',
      title: 'my test',
      titlePath: ['my test'],
      location: { file: 'a.spec.ts', line: 1, column: 1 },
      status: 'passed',
      duration: 100,
      errors: [],
      retry: 0,
      annotations: [],
      attachments: [],
    })
    const res = await runs.request('/run-1')
    expect(res.status).toBe(200)
    const body = (await res.json()) as storage.RunRecord & { tests: storage.TestRecord[] }
    expect(body.runId).toBe('run-1')
    expect(body.tests).toHaveLength(1)
  })
})

describe('POST /api/runs/:runId/tests', () => {
  it('saves test metadata and returns 201', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const metadata: storage.TestRecord = {
      testId: 'suite--my-test',
      title: 'my test',
      titlePath: ['suite', 'my test'],
      location: { file: 'a.spec.ts', line: 5, column: 1 },
      status: 'passed',
      duration: 300,
      errors: [],
      retry: 0,
      annotations: [],
      attachments: [],
    }
    const form = new FormData()
    form.append('metadata', JSON.stringify(metadata))
    const res = await runs.request('/run-1/tests', { method: 'POST', body: form })
    expect(res.status).toBe(201)
    expect(await storage.getTestResults('run-1')).toHaveLength(1)
    expect((await storage.getTestResults('run-1'))[0].testId).toBe('suite--my-test')
  })

  it('saves attachment files to disk', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const metadata: storage.TestRecord = {
      testId: 'test-with-attach',
      title: 'test',
      titlePath: ['test'],
      location: { file: 'a.spec.ts', line: 1, column: 1 },
      status: 'failed',
      duration: 100,
      errors: [],
      retry: 0,
      annotations: [],
      attachments: [
        { name: 'screenshot.png', contentType: 'image/png', filename: 'screenshot.png' },
      ],
    }
    const form = new FormData()
    form.append('metadata', JSON.stringify(metadata))
    form.append(
      'attachment_0',
      new Blob([Buffer.from('fake-png')], { type: 'image/png' }),
      'screenshot.png',
    )
    await runs.request('/run-1/tests', { method: 'POST', body: form })
    const attachPath = join(testDir, 'run-1', 'attachments', 'test-with-attach', 'screenshot.png')
    expect(existsSync(attachPath)).toBe(true)
  })

  it('emits run:updated after saving a test', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-04T10:00:00.000Z',
      status: 'running',
    })
    const spy = vi.spyOn(runEmitter, 'emit')
    const metadata: storage.TestRecord = {
      testId: 'suite--my-test',
      title: 'my test',
      titlePath: ['suite', 'my test'],
      location: { file: 'a.spec.ts', line: 5, column: 1 },
      status: 'passed',
      duration: 300,
      errors: [],
      retry: 0,
      annotations: [],
      attachments: [],
    }
    const form = new FormData()
    form.append('metadata', JSON.stringify(metadata))
    await runs.request('/run-1/tests', { method: 'POST', body: form })
    expect(spy).toHaveBeenCalledWith('event', { type: 'run:updated', runId: 'run-1' })
    spy.mockRestore()
  })
})

describe('POST /api/runs/:runId/report', () => {
  it('extracts zip, sets reportUrl, updates run status', async () => {
    const AdmZip = (await import('adm-zip')).default
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })

    const zip = new AdmZip()
    zip.addFile('index.html', Buffer.from('<html>Report</html>'))
    const zipBuf = zip.toBuffer()

    const form = new FormData()
    form.append('report', new Blob([zipBuf], { type: 'application/zip' }), 'report.zip')
    form.append('completedAt', '2026-04-02T10:05:00.000Z')
    form.append('status', 'passed')

    const res = await runs.request('/run-1/report', { method: 'POST', body: form })
    expect(res.status).toBe(200)

    const { reportUrl } = (await res.json()) as { reportUrl: string }
    expect(reportUrl).toBe('/reports/run-1/report/index.html')

    const run = await storage.getRun('run-1')
    expect(run?.status).toBe('passed')
    expect(run?.reportUrl).toBe('/reports/run-1/report/index.html')

    expect(existsSync(join(testDir, 'run-1', 'report', 'index.html'))).toBe(true)
  })

  it('emits run:updated after uploading a report', async () => {
    const AdmZip = (await import('adm-zip')).default
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-04T10:00:00.000Z',
      status: 'running',
    })
    const spy = vi.spyOn(runEmitter, 'emit')

    const zip = new AdmZip()
    zip.addFile('index.html', Buffer.from('<html/>'))
    const form = new FormData()
    form.append('report', new Blob([zip.toBuffer()], { type: 'application/zip' }), 'report.zip')
    form.append('completedAt', '2026-04-04T10:05:00.000Z')
    form.append('status', 'passed')
    await runs.request('/run-1/report', { method: 'POST', body: form })

    expect(spy).toHaveBeenCalledWith('event', { type: 'run:updated', runId: 'run-1' })
    spy.mockRestore()
  })
})

describe('POST /api/runs/:runId/complete', () => {
  it('updates run status and completedAt', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const res = await runs.request('/run-1/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedAt: '2026-04-02T10:05:00.000Z', status: 'passed' }),
    })
    expect(res.status).toBe(200)
    const run = await storage.getRun('run-1')
    expect(run?.status).toBe('passed')
    expect(run?.completedAt).toBe('2026-04-02T10:05:00.000Z')
  })

  it('emits run:updated after completing a run', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-04T10:00:00.000Z',
      status: 'running',
    })
    const spy = vi.spyOn(runEmitter, 'emit')
    await runs.request('/run-1/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedAt: '2026-04-04T10:05:00.000Z', status: 'passed' }),
    })
    expect(spy).toHaveBeenCalledWith('event', { type: 'run:updated', runId: 'run-1' })
    spy.mockRestore()
  })
})

describe('GET /api/runs/:runId/tests/:testId', () => {
  it('returns 404 when run does not exist', async () => {
    const res = await runs.request('/no-such-run/tests/test-1')
    expect(res.status).toBe(404)
  })

  it('returns 404 when test does not exist', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const res = await runs.request('/run-1/tests/no-such-test')
    expect(res.status).toBe(404)
  })

  it('returns the test record', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const test: storage.TestRecord = {
      testId: 'my-test',
      title: 'my test',
      titlePath: ['suite', 'my test'],
      location: { file: 'a.spec.ts', line: 1, column: 1 },
      status: 'passed',
      duration: 100,
      errors: [],
      retry: 0,
      annotations: [],
      attachments: [],
    }
    await storage.writeTestResult('run-1', test)
    const res = await runs.request('/run-1/tests/my-test')
    expect(res.status).toBe(200)
    const body = (await res.json()) as storage.TestRecord
    expect(body.testId).toBe('my-test')
    expect(body.title).toBe('my test')
  })
})
```

- [ ] **Step 2: Run the full test suite — all tests should pass**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests in `storage.test.ts` and `routes.test.ts` and `app.test.ts` PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/runs/routes.test.ts
git commit -m "test(server): update routes tests for async DB storage"
```

---

## Task 10: Update Server Entry Point

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Add migration call before serve()**

Replace the entire file `packages/server/src/index.ts`:

```typescript
import { serve } from '@hono/node-server'
import { app } from './app.js'
import { runMigrations } from './db/migrate.js'

const port = Number(process.env.PORT ?? 3001)

await runMigrations()

serve({ fetch: app.fetch, port }, () => {
  console.log(`[playwright-cart/server] listening on http://localhost:${port}`)
})
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @playwright-cart/server typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): run db migrations at startup before listening"
```

---

## Task 11: Update Docker Compose and Environment Files

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Update docker-compose.yml**

Replace the entire file `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: playwright_cart
      POSTGRES_PASSWORD: playwright_cart
      POSTGRES_DB: playwright_cart
    volumes:
      - db_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U playwright_cart"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

  server:
    build:
      context: .
      dockerfile: packages/server/Dockerfile
    ports:
      - "3001:3001"
    volumes:
      - reports_data:/app/data
    depends_on:
      postgres:
        condition: service_healthy
    env_file:
      - path: .env
        required: false
    environment:
      PORT: "${PORT:-3001}"
      DATA_DIR: "${DATA_DIR:-/app/data}"
      DATABASE_URL: "${DATABASE_URL:-postgresql://playwright_cart:playwright_cart@postgres:5432/playwright_cart}"
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/runs"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: packages/web/Dockerfile
    ports:
      - "80:80"
    depends_on:
      server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost/"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s
    restart: unless-stopped

volumes:
  reports_data:
  db_data:
```

> Note: `start_period` on the server healthcheck is raised to 15s to give migrations time to complete on a fresh DB.

- [ ] **Step 2: Update .env.example**

Replace the entire file `.env.example`:

```
# Server port (default: 3001)
PORT=3001

# Directory where attachments and extracted HTML reports are stored (default: /app/data)
DATA_DIR=/app/data

# PostgreSQL connection string
# For docker-compose: set automatically via environment in docker-compose.yml
# For local development: point to your local PostgreSQL instance
DATABASE_URL=postgresql://playwright_cart:playwright_cart@localhost:5432/playwright_cart
```

- [ ] **Step 3: Test docker-compose starts correctly**

```bash
docker compose down -v  # clean slate
docker compose up --build -d
docker compose ps       # wait for all services to show "healthy"
```

Expected: all three services (`postgres`, `server`, `web`) eventually show `healthy`.

```bash
curl http://localhost:3001/api/runs
```

Expected: `[]`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(deploy): add postgresql service to docker-compose, inject DATABASE_URL"
```

---

## Task 12: Update README.md and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Architecture section in README.md**

Find and replace the Architecture section (lines starting with `## Architecture` through the closing paragraph before `## Quick Start`):

```markdown
## Architecture

```
playwright tests
      │
      │  @playwright-cart/reporter (npm package)
      │  streams results during test run
      ▼
┌─────────────┐        ┌─────────────┐
│   server    │◄───────│     web     │
│  (Hono API) │  /api  │ (React SPA) │
│  port 3001  │        │   port 80   │
└─────────────┘        └─────────────┘
      │                      
  PostgreSQL         data volume
  (run + test        (attachments,
   metadata)          report files)
```

The **server** stores run and test metadata in PostgreSQL via Drizzle ORM. Binary files — test attachments (screenshots, traces) and extracted HTML reports — are stored on disk in `DATA_DIR`. The **web** frontend is a static React SPA served by Nginx; Nginx proxies `/api` and `/reports` to the server container. The **reporter** npm package is installed in the project under test — not deployed here.
```

- [ ] **Step 2: Update the Configuration table in README.md**

Find and replace the configuration table:

```markdown
## Configuration

Environment variables for the server (set in `.env` or your CI environment):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the server listens on |
| `DATABASE_URL` | *(required)* | PostgreSQL connection string. In Docker Compose this is set automatically. For local dev, copy `.env.example` to `.env` and point at your local instance. |
| `DATA_DIR` | `/app/data` | Directory for binary files: test attachments and extracted HTML reports |

> **Note:** `DATABASE_URL` is automatically set when using `docker compose up`. For local development without Docker, you need a running PostgreSQL instance and `DATABASE_URL` set in your environment or `.env`.

Copy `.env.example` to `.env` to customise:

```bash
cp .env.example .env
```
```

- [ ] **Step 3: Update the Docker Details section in README.md**

Find and replace the Docker Details section:

```markdown
## Docker Details

The stack uses three containers:

- **postgres** — PostgreSQL 17 Alpine, stores all run and test metadata
- **server** — Node.js Alpine, built from `packages/server/Dockerfile`; runs DB migrations at startup then starts the Hono API
- **web** — Nginx Alpine serving the Vite build, proxying to server

Both server and web use multi-stage Docker builds. Two named volumes persist data across restarts: `db_data` for the PostgreSQL database, `reports_data` for binary attachments and extracted HTML reports.

```bash
# Rebuild after code changes
docker compose up --build

# View logs
docker compose logs -f

# Check health status
docker compose ps

# Stop and remove containers (volumes preserved)
docker compose down

# Stop and remove containers AND all data (DB + reports)
docker compose down -v
```
```

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`, find the `packages/server` description under `### Packages` and update the on-disk layout section. Replace the existing server package description:

```markdown
**`packages/server`** — Node.js REST API using [Hono](https://hono.dev) + `@hono/node-server`
- `POST /api/runs` — create a new run, returns `{ runId }`
- `GET /api/runs` — list all runs (sorted newest-first)
- `GET /api/runs/:runId` — run record + all test results
- `POST /api/runs/:runId/tests` — upload a single test result with attachments (multipart)
- `POST /api/runs/:runId/report` — upload zipped HTML report, extracts and links it
- `POST /api/runs/:runId/complete` — mark run complete without an HTML report
- `GET /reports/*` — serves extracted static report files (`Service-Worker-Allowed` + cache headers required for Playwright trace viewer)
- Uses **Drizzle ORM** + PostgreSQL for structured data: `runs`, `tests`, `test_errors`, `test_annotations`, `test_attachments` tables
- Binary files (screenshots, traces, extracted HTML reports) remain on disk at `{DATA_DIR}/{runId}/attachments/` and `{DATA_DIR}/{runId}/report/`
- Runs DB migrations at startup via `src/db/migrate.ts` (Drizzle migrate)
- Env vars: `DATABASE_URL` (required), `DATA_DIR` (default `./data`), `PORT` (default `3001`)
```

- [ ] **Step 5: Run full test suite one final time**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update README and CLAUDE.md for postgresql storage migration"
```

---

## Verification Checklist

After all tasks are complete, run through these checks end-to-end:

- [ ] `docker compose down -v && docker compose up --build -d` — fresh stack starts cleanly
- [ ] `docker compose ps` — all three services show `healthy`
- [ ] `curl http://localhost:3001/api/runs` → `[]`
- [ ] Run `pnpm --filter @playwright-cart/e2e test` — reporter sends data to server, confirm runs appear
- [ ] `curl http://localhost:3001/api/runs` → contains the new run
- [ ] `curl http://localhost:3001/api/runs/<runId>` → run includes `tests[]` array with errors/annotations/attachments populated
- [ ] Open `http://localhost` — dashboard shows the run
- [ ] Click a test with a trace → trace viewer opens (binary files still served from disk)
- [ ] `docker compose logs server` — shows "DB migrations applied" then "listening on..."
- [ ] `pnpm --filter @playwright-cart/server test` — all tests pass
