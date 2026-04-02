# Reporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the `@playwright-cart/reporter` Playwright custom reporter and the server-side `/api/runs` REST API it uploads to, enabling real-time per-test result streaming and final HTML report upload.

**Architecture:** The reporter fires-and-forgets per-test multipart uploads from `onTestEnd` (with retry/concurrency control), awaits them all in `onEnd`, then uploads the HTML report zip if that reporter is configured. The server stores run and test data as JSON files on disk under `data/{runId}/` alongside extracted report files.

**Tech Stack:** Node.js 24, TypeScript (NodeNext), Hono 4.x (server), `archiver` (zip creation in reporter), `adm-zip` (zip extraction in server), `vitest` (testing both packages).

---

## File Map

**Server — new files:**
- `packages/server/src/runs/storage.ts` — typed read/write helpers for `data/` filesystem
- `packages/server/src/runs/routes.ts` — Hono sub-app with all `/api/runs` handlers
- `packages/server/src/runs/storage.test.ts` — Vitest tests for storage
- `packages/server/src/runs/routes.test.ts` — Vitest integration tests (using `app.request()`, real temp dir)

**Server — modified:**
- `packages/server/src/index.ts` — remove `POST /api/reports` stub, mount `runs` sub-app
- `packages/server/package.json` — add `adm-zip`, `@types/adm-zip`, `vitest` devDep, `test` script

**Reporter — new files:**
- `packages/reporter/src/upload.ts` — `buildTestId`, `uploadWithRetry`, `Semaphore`, `zipDirectory`
- `packages/reporter/src/upload.test.ts` — Vitest unit tests

**Reporter — modified:**
- `packages/reporter/src/index.ts` — full implementation of `onBegin`, `onTestEnd`, `onEnd`
- `packages/reporter/package.json` — add `archiver`, `@types/archiver`, `vitest` devDep, `test` script

---

## Task 1: Add dependencies to both packages

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/reporter/package.json`

- [ ] **Step 1: Add server dependencies**

```bash
cd packages/server && pnpm add adm-zip && pnpm add -D @types/adm-zip vitest
```

- [ ] **Step 2: Add test script to server package.json**

In `packages/server/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Add reporter dependencies**

```bash
cd packages/reporter && pnpm add archiver && pnpm add -D @types/archiver vitest
```

- [ ] **Step 4: Add test script to reporter package.json**

In `packages/reporter/package.json`, add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/package.json packages/reporter/package.json pnpm-lock.yaml
git commit -m "chore: add adm-zip, archiver, and vitest dependencies"
```

---

## Task 2: Server storage module

**Files:**
- Create: `packages/server/src/runs/storage.ts`
- Create: `packages/server/src/runs/storage.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/runs/storage.test.ts`:

```typescript
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as storage from './storage.js'

let testDir: string

beforeEach(() => {
  testDir = join(tmpdir(), `pct-test-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
  storage.dataDir = testDir
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
})

describe('createRun / getRun', () => {
  it('persists and retrieves a run record', () => {
    const run: storage.RunRecord = {
      runId: 'my-project-123',
      project: 'my-project',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    }
    storage.createRun(run)
    expect(storage.getRun('my-project-123')).toEqual(run)
  })

  it('returns null for a missing run', () => {
    expect(storage.getRun('not-exist')).toBeNull()
  })
})

describe('updateRun', () => {
  it('merges partial updates into the existing record', () => {
    storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })
    storage.updateRun('run-1', { status: 'passed', completedAt: '2026-04-02T10:01:00.000Z' })
    const run = storage.getRun('run-1')
    expect(run?.status).toBe('passed')
    expect(run?.completedAt).toBe('2026-04-02T10:01:00.000Z')
    expect(run?.project).toBe('p') // untouched field preserved
  })
})

describe('listRuns', () => {
  it('returns an empty array when no runs exist', () => {
    expect(storage.listRuns()).toEqual([])
  })

  it('returns runs sorted by startedAt descending', () => {
    storage.createRun({ runId: 'a', project: 'p', startedAt: '2026-04-02T09:00:00.000Z', status: 'running' })
    storage.createRun({ runId: 'b', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })
    const runs = storage.listRuns()
    expect(runs[0].runId).toBe('b')
    expect(runs[1].runId).toBe('a')
  })
})

describe('writeTestResult / getTestResults', () => {
  it('stores and retrieves test results', () => {
    storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })
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
    storage.writeTestResult('run-1', test)
    expect(storage.getTestResults('run-1')).toEqual([test])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: multiple errors like `Cannot find module './storage.js'`

- [ ] **Step 3: Implement storage.ts**

Create `packages/server/src/runs/storage.ts`:

```typescript
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export let dataDir = process.env['DATA_DIR'] ?? './data'

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

export function createRun(run: RunRecord): void {
  const dir = join(dataDir, run.runId)
  mkdirSync(join(dir, 'tests'), { recursive: true })
  mkdirSync(join(dir, 'attachments'), { recursive: true })
  writeFileSync(join(dir, 'run.json'), JSON.stringify(run, null, 2))
}

export function getRun(runId: string): RunRecord | null {
  const path = join(dataDir, runId, 'run.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as RunRecord
}

export function updateRun(runId: string, update: Partial<RunRecord>): void {
  const existing = getRun(runId)
  if (!existing) throw new Error(`Run not found: ${runId}`)
  writeFileSync(join(dataDir, runId, 'run.json'), JSON.stringify({ ...existing, ...update }, null, 2))
}

export function listRuns(): RunRecord[] {
  if (!existsSync(dataDir)) return []
  return readdirSync(dataDir, { withFileTypes: true })
    .filter(e => e.isDirectory() && existsSync(join(dataDir, e.name, 'run.json')))
    .map(e => JSON.parse(readFileSync(join(dataDir, e.name, 'run.json'), 'utf-8')) as RunRecord)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
}

export function writeTestResult(runId: string, test: TestRecord): void {
  writeFileSync(join(dataDir, runId, 'tests', `${test.testId}.json`), JSON.stringify(test, null, 2))
}

export function getTestResults(runId: string): TestRecord[] {
  const dir = join(dataDir, runId, 'tests')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as TestRecord)
}

export function getAttachmentsDir(runId: string, testId: string): string {
  const dir = join(dataDir, runId, 'attachments', testId)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getReportDir(runId: string): string {
  const dir = join(dataDir, runId, 'report')
  mkdirSync(dir, { recursive: true })
  return dir
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/runs/
git commit -m "feat(server): add run storage module with tests"
```

---

## Task 3: Server run routes — create, list, and complete

**Files:**
- Create: `packages/server/src/runs/routes.ts`
- Create: `packages/server/src/runs/routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/runs/routes.test.ts`:

```typescript
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as storage from './storage.js'
import { runs } from './routes.js'

let testDir: string

beforeEach(() => {
  testDir = join(tmpdir(), `pct-routes-test-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
  storage.dataDir = testDir
})

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true })
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
    expect(storage.getRun(runId)).not.toBeNull()
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
    const run = storage.getRun(runId)
    expect(run?.branch).toBe('main')
    expect(run?.commitSha).toBe('abc123')
  })
})

describe('GET /api/runs', () => {
  it('returns an empty array when no runs exist', async () => {
    const res = await runs.request('/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('returns existing runs', async () => {
    storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })
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
    storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })
    storage.writeTestResult('run-1', {
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

describe('POST /api/runs/:runId/complete', () => {
  it('updates run status and completedAt', async () => {
    storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })
    const res = await runs.request('/run-1/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedAt: '2026-04-02T10:05:00.000Z', status: 'passed' }),
    })
    expect(res.status).toBe(200)
    const run = storage.getRun('run-1')
    expect(run?.status).toBe('passed')
    expect(run?.completedAt).toBe('2026-04-02T10:05:00.000Z')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: errors like `Cannot find module './routes.js'`

- [ ] **Step 3: Create routes.ts with core handlers**

Create `packages/server/src/runs/routes.ts`:

```typescript
import { Hono } from 'hono'
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
  storage.createRun(run)
  return c.json({ runId }, 201)
})

runs.get('/', (c) => {
  return c.json(storage.listRuns())
})

runs.get('/:runId', (c) => {
  const run = storage.getRun(c.req.param('runId'))
  if (!run) return c.json({ error: 'Not found' }, 404)
  const tests = storage.getTestResults(c.req.param('runId'))
  return c.json({ ...run, tests })
})

runs.post('/:runId/complete', async (c) => {
  const { completedAt, status } = await c.req.json<{
    completedAt: string
    status: storage.RunRecord['status']
  }>()
  storage.updateRun(c.req.param('runId'), { completedAt, status })
  return c.json({})
})
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all storage + routes tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/runs/routes.ts packages/server/src/runs/routes.test.ts
git commit -m "feat(server): add run CRUD routes with tests"
```

---

## Task 4: Server — test upload route

**Files:**
- Modify: `packages/server/src/runs/routes.ts`
- Modify: `packages/server/src/runs/routes.test.ts`

- [ ] **Step 1: Add failing test for POST /api/runs/:runId/tests**

First, update the `node:fs` import at the top of `packages/server/src/runs/routes.test.ts` to include `existsSync`:

```typescript
import { existsSync, mkdirSync, rmSync } from 'node:fs'
```

Then append the following describe block to `packages/server/src/runs/routes.test.ts`:

```typescript
describe('POST /api/runs/:runId/tests', () => {
  it('saves test metadata and returns 201', async () => {
    storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })
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
    expect(storage.getTestResults('run-1')).toHaveLength(1)
    expect(storage.getTestResults('run-1')[0].testId).toBe('suite--my-test')
  })

  it('saves attachment files to disk', async () => {
    storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })
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
      attachments: [{ name: 'screenshot.png', contentType: 'image/png', filename: 'screenshot.png' }],
    }
    const form = new FormData()
    form.append('metadata', JSON.stringify(metadata))
    form.append('attachment_0', new Blob([Buffer.from('fake-png')], { type: 'image/png' }), 'screenshot.png')
    await runs.request('/run-1/tests', { method: 'POST', body: form })
    const attachPath = join(testDir, 'run-1', 'attachments', 'test-with-attach', 'screenshot.png')
    expect(existsSync(attachPath)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: 2 new failing tests (route returns 404)

- [ ] **Step 3: Add the test upload handler to routes.ts**

Add to `packages/server/src/runs/routes.ts` (before the export, after the existing handlers):

```typescript
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
```

Add the route handler:

```typescript
runs.post('/:runId/tests', async (c) => {
  const body = await c.req.parseBody()
  const metadata = JSON.parse(body['metadata'] as string) as storage.TestRecord
  const attachmentsDir = storage.getAttachmentsDir(c.req.param('runId'), metadata.testId)

  for (let i = 0; ; i++) {
    const file = body[`attachment_${i}`]
    if (!file) break
    if (file instanceof File) {
      const buf = Buffer.from(await file.arrayBuffer())
      writeFileSync(join(attachmentsDir, file.name), buf)
    }
  }

  storage.writeTestResult(c.req.param('runId'), metadata)
  return c.json({ testId: metadata.testId }, 201)
})
```

Note: add `import { writeFileSync } from 'node:fs'` and `import { join } from 'node:path'` at the top of routes.ts.

- [ ] **Step 4: Run to confirm passing**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/runs/routes.ts packages/server/src/runs/routes.test.ts
git commit -m "feat(server): add per-test upload route with attachment saving"
```

---

## Task 5: Server — report upload route

**Files:**
- Modify: `packages/server/src/runs/routes.ts`
- Modify: `packages/server/src/runs/routes.test.ts`

- [ ] **Step 1: Add failing test for POST /api/runs/:runId/report**

The `existsSync` import was added in Task 4. Append to `packages/server/src/runs/routes.test.ts`:

```typescript
describe('POST /api/runs/:runId/report', () => {
  it('extracts zip, sets reportUrl, updates run status', async () => {
    const AdmZip = (await import('adm-zip')).default
    storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'running' })

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
    expect(reportUrl).toBe('/reports/run-1/index.html')

    const run = storage.getRun('run-1')
    expect(run?.status).toBe('passed')
    expect(run?.reportUrl).toBe('/reports/run-1/index.html')

    expect(existsSync(join(testDir, 'run-1', 'report', 'index.html'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: new failing test (route returns 404)

- [ ] **Step 3: Add report upload handler to routes.ts**

Add `import AdmZip from 'adm-zip'` at the top of `packages/server/src/runs/routes.ts`, then add:

```typescript
runs.post('/:runId/report', async (c) => {
  const runId = c.req.param('runId')
  const body = await c.req.parseBody()
  const reportFile = body['report'] as File
  const completedAt = body['completedAt'] as string
  const status = body['status'] as storage.RunRecord['status']

  const zipBuf = Buffer.from(await reportFile.arrayBuffer())
  const zip = new AdmZip(zipBuf)
  zip.extractAllTo(storage.getReportDir(runId), true)

  const reportUrl = `/reports/${runId}/index.html`
  storage.updateRun(runId, { completedAt, status, reportUrl })

  return c.json({ reportUrl })
})
```

- [ ] **Step 4: Run to confirm passing**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/runs/routes.ts packages/server/src/runs/routes.test.ts
git commit -m "feat(server): add HTML report upload route with zip extraction"
```

---

## Task 6: Wire up runs routes in server index.ts

**Files:**
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Read the current index.ts**

Read `packages/server/src/index.ts` to see the full current content.

- [ ] **Step 2: Replace the file**

Replace `packages/server/src/index.ts` with:

```typescript
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { runs } from './runs/routes.js'

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors())

app.route('/api/runs', runs)

app.use('/reports/*', async (c, next) => {
  await next()
  c.header('Service-Worker-Allowed', '/')
  c.header('Accept-Ranges', 'bytes')
  if (c.req.path.endsWith('.html')) {
    c.header('Cache-Control', 'no-cache')
  } else {
    c.header('Cache-Control', 'public, max-age=604800')
  }
})
app.use('/reports/*', serveStatic({ root: './data' }))

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[playwright-cart/server] listening on http://localhost:${port}`)
})
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @playwright-cart/server typecheck
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): mount /api/runs routes, remove old /api/reports stub"
```

---

## Task 7: Reporter upload utilities

**Files:**
- Create: `packages/reporter/src/upload.ts`
- Create: `packages/reporter/src/upload.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/reporter/src/upload.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { Semaphore, buildTestId, uploadWithRetry } from './upload.js'

describe('buildTestId', () => {
  it('joins titlePath with -- and slugifies', () => {
    expect(buildTestId(['Suite A', 'test: passes!'], 0)).toBe('suite-a--test--passes-')
  })

  it('appends retry suffix when retry > 0', () => {
    expect(buildTestId(['My Test'], 1)).toBe('my-test-retry1')
  })

  it('does not append retry suffix when retry is 0', () => {
    expect(buildTestId(['My Test'], 0)).toBe('my-test')
  })
})

describe('uploadWithRetry', () => {
  it('calls fn once on success', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    await uploadWithRetry(fn, 3, 1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on non-2xx response until success', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValue(new Response('', { status: 201 }))
    await uploadWithRetry(fn, 3, 1)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('does not throw after all retries are exhausted', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('', { status: 500 }))
    await expect(uploadWithRetry(fn, 2, 1)).resolves.toBeUndefined()
    expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  it('retries on network error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(new Response('', { status: 200 }))
    await uploadWithRetry(fn, 3, 1)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('logs a warning on final failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fn = vi.fn().mockRejectedValue(new Error('timeout'))
    await uploadWithRetry(fn, 1, 1)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[playwright-cart]'))
    warn.mockRestore()
  })
})

describe('Semaphore', () => {
  it('allows up to concurrency simultaneous acquires', async () => {
    const sem = new Semaphore(2)
    let active = 0
    let maxActive = 0

    const task = async () => {
      await sem.acquire()
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
      sem.release()
    }

    await Promise.all([task(), task(), task(), task()])
    expect(maxActive).toBe(2)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm --filter @playwright-cart/reporter test
```

Expected: errors — module not found

- [ ] **Step 3: Implement upload.ts**

Create `packages/reporter/src/upload.ts`:

```typescript
import archiver from 'archiver'
import { createWriteStream, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function buildTestId(titlePath: string[], retry: number): string {
  const slug = titlePath
    .map((p) => p.replace(/[^a-z0-9]/gi, '-').toLowerCase())
    .join('--')
  return retry > 0 ? `${slug}-retry${retry}` : slug
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function uploadWithRetry(
  fn: () => Promise<Response>,
  retries: number,
  delay: number,
): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fn()
      if (res.ok) return
      throw new Error(`HTTP ${res.status}`)
    } catch (err) {
      if (attempt === retries) {
        console.warn(`[playwright-cart] upload failed after ${retries} retries: ${err}`)
        return
      }
      await sleep(delay * 2 ** attempt)
    }
  }
}

export class Semaphore {
  private count: number
  private queue: Array<() => void> = []

  constructor(concurrency: number) {
    this.count = concurrency
  }

  acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--
      return Promise.resolve()
    }
    return new Promise((resolve) => this.queue.push(resolve))
  }

  release(): void {
    const next = this.queue.shift()
    if (next) {
      next()
    } else {
      this.count++
    }
  }
}

export async function zipDirectory(dir: string): Promise<Buffer> {
  const zipPath = join(tmpdir(), `pct-report-${Date.now()}.zip`)
  await new Promise<void>((resolve, reject) => {
    const out = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    out.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(out)
    archive.directory(dir, false)
    void archive.finalize()
  })
  const buf = readFileSync(zipPath)
  rmSync(zipPath)
  return buf
}
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
pnpm --filter @playwright-cart/reporter test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/reporter/src/upload.ts packages/reporter/src/upload.test.ts
git commit -m "feat(reporter): add upload utilities — retry, semaphore, testId, zip"
```

---

## Task 8: Reporter main class implementation

**Files:**
- Modify: `packages/reporter/src/index.ts`

- [ ] **Step 1: Read the current index.ts**

Read `packages/reporter/src/index.ts` to see the existing skeleton.

- [ ] **Step 2: Replace index.ts with full implementation**

```typescript
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Semaphore, buildTestId, uploadWithRetry, zipDirectory } from './upload.js'

export interface PlaywrightCartReporterOptions {
  /** Base URL of the playwright-cart server, e.g. http://localhost:3001 */
  serverUrl: string
  /** Identifies this project in the dashboard */
  project: string
  /** Git branch name */
  branch?: string
  /** Git commit SHA */
  commitSha?: string
  /** Max parallel test uploads (default: 3) */
  uploadConcurrency?: number
  /** Upload retry attempts (default: 3) */
  retries?: number
  /** Initial retry backoff in ms, doubles each attempt (default: 500) */
  retryDelay?: number
}

export class PlaywrightCartReporter implements Reporter {
  private readonly serverUrl: string
  private readonly project: string
  private readonly branch: string | undefined
  private readonly commitSha: string | undefined
  private readonly retries: number
  private readonly retryDelay: number
  private readonly semaphore: Semaphore

  private runIdPromise: Promise<string | null> = Promise.resolve(null)
  private pendingUploads: Promise<void>[] = []
  private htmlReporterEnabled = false
  private reportOutputDir = 'playwright-report'

  constructor(options: PlaywrightCartReporterOptions) {
    this.serverUrl = options.serverUrl.replace(/\/$/, '')
    this.project = options.project
    this.branch = options.branch
    this.commitSha = options.commitSha
    this.retries = options.retries ?? 3
    this.retryDelay = options.retryDelay ?? 500
    this.semaphore = new Semaphore(options.uploadConcurrency ?? 3)
  }

  onBegin(config: FullConfig, _suite: Suite): void {
    // Detect HTML reporter and its configured output directory
    const htmlEntry = config.reporter.find((r) => r[0] === 'html')
    if (htmlEntry) {
      this.htmlReporterEnabled = true
      const outputFolder = (htmlEntry[1] as { outputFolder?: string } | undefined)?.outputFolder
      if (outputFolder) this.reportOutputDir = outputFolder
    }

    // Fire-and-forget run creation (onBegin is synchronous)
    this.runIdPromise = fetch(`${this.serverUrl}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: this.project,
        branch: this.branch,
        commitSha: this.commitSha,
        startedAt: new Date().toISOString(),
      }),
    })
      .then((r) => r.json() as Promise<{ runId: string }>)
      .then((data) => data.runId)
      .catch((err) => {
        console.warn(`[playwright-cart] failed to create run: ${err}`)
        return null
      })
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const upload = (async () => {
      const runId = await this.runIdPromise
      if (!runId) return

      const testId = buildTestId(test.titlePath(), result.retry)
      const attachmentMeta = result.attachments.map((a) => ({
        name: a.name,
        contentType: a.contentType,
        filename: a.path ? a.name : undefined,
      }))

      const metadata = {
        testId,
        title: test.title,
        titlePath: test.titlePath(),
        location: test.location,
        status: result.status,
        duration: result.duration,
        errors: result.errors.map((e) => ({ message: e.message ?? '', stack: e.stack })),
        retry: result.retry,
        annotations: test.annotations,
        attachments: attachmentMeta,
      }

      const form = new FormData()
      form.append('metadata', JSON.stringify(metadata))

      for (const [i, att] of result.attachments.entries()) {
        if (att.path && existsSync(att.path)) {
          const buf = readFileSync(att.path)
          form.append(`attachment_${i}`, new Blob([buf], { type: att.contentType }), att.name)
        } else if (att.body) {
          form.append(
            `attachment_${i}`,
            new Blob([att.body], { type: att.contentType }),
            att.name,
          )
        }
      }

      await this.semaphore.acquire()
      try {
        await uploadWithRetry(
          () =>
            fetch(`${this.serverUrl}/api/runs/${runId}/tests`, {
              method: 'POST',
              body: form,
            }),
          this.retries,
          this.retryDelay,
        )
      } finally {
        this.semaphore.release()
      }
    })()

    this.pendingUploads.push(upload)
  }

  async onEnd(result: FullResult): Promise<void> {
    // Drain all in-flight test uploads
    await Promise.allSettled(this.pendingUploads)

    const runId = await this.runIdPromise
    if (!runId) return

    const completedAt = new Date().toISOString()
    const status = result.status

    if (this.htmlReporterEnabled) {
      const reportDir = resolve(process.cwd(), this.reportOutputDir)
      if (!existsSync(reportDir)) {
        console.warn(`[playwright-cart] HTML report dir not found: ${reportDir}`)
        return
      }
      try {
        const zipBuf = await zipDirectory(reportDir)
        const form = new FormData()
        form.append('report', new Blob([zipBuf], { type: 'application/zip' }), 'report.zip')
        form.append('completedAt', completedAt)
        form.append('status', status)
        await uploadWithRetry(
          () =>
            fetch(`${this.serverUrl}/api/runs/${runId}/report`, {
              method: 'POST',
              body: form,
            }),
          this.retries,
          this.retryDelay,
        )
      } catch (err) {
        console.warn(`[playwright-cart] failed to upload report: ${err}`)
      }
    } else {
      await uploadWithRetry(
        () =>
          fetch(`${this.serverUrl}/api/runs/${runId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completedAt, status }),
          }),
        this.retries,
        this.retryDelay,
      )
    }
  }
}

export default PlaywrightCartReporter
```

- [ ] **Step 3: Typecheck**

```bash
pnpm --filter @playwright-cart/reporter typecheck
```

Expected: no errors

- [ ] **Step 4: Run all reporter tests to confirm nothing broke**

```bash
pnpm --filter @playwright-cart/reporter test
```

Expected: all upload utility tests still pass

- [ ] **Step 5: Commit**

```bash
git add packages/reporter/src/index.ts
git commit -m "feat(reporter): implement onBegin, onTestEnd, onEnd with upload logic"
```

---

## Verification

End-to-end smoke test:

1. Start the server:
   ```bash
   pnpm --filter @playwright-cart/server dev
   ```

2. In a separate Playwright project, configure `playwright.config.ts`:
   ```typescript
   import { defineConfig } from '@playwright/test'
   export default defineConfig({
     reporter: [
       ['html'],
       ['@playwright-cart/reporter', {
         serverUrl: 'http://localhost:3001',
         project: 'smoke-test',
         branch: 'main',
       }],
     ],
     use: { trace: 'on' },
   })
   ```

3. Run a test suite. Confirm:
   - `[playwright-cart]` log lines appear during the run
   - `data/{runId}/tests/*.json` files exist with correct status
   - `data/{runId}/attachments/` contains screenshot/trace files
   - `data/{runId}/report/index.html` exists after run completes

4. Call `GET http://localhost:3001/api/runs` — confirms the run appears with correct counts.

5. Kill the server mid-run, restart after — confirm the test run completes with warnings only, no crash.
