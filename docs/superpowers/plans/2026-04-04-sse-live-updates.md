# SSE Live Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace polling on the runs list and run detail page with Server-Sent Events so new runs and status changes appear in real time without manual page refresh.

**Architecture:** A typed Node.js `EventEmitter` singleton (`events.ts`) acts as an in-process broadcast bus. Route handlers emit `run:created` / `run:updated` events on it. A Hono `streamSSE` endpoint at `GET /api/events` subscribes each connected client and forwards events. The frontend holds one persistent `EventSource` in `Layout.tsx` and calls `queryClient.invalidateQueries` when events arrive, replacing all polling.

**Tech Stack:** Hono `streamSSE` (hono/streaming), Node.js `EventEmitter`, React `EventSource` API, TanStack React Query v5 cache invalidation.

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Create | `packages/server/src/events.ts` | Typed EventEmitter singleton + RunEvent type |
| Create | `packages/server/src/events.test.ts` | Unit tests for emitter |
| Create | `packages/server/src/app.ts` | Hono app configuration (extracted from index.ts) |
| Create | `packages/server/src/app.test.ts` | SSE endpoint tests |
| Modify | `packages/server/src/index.ts` | Import app from app.ts, just starts the server |
| Modify | `packages/server/src/runs/routes.ts` | Emit events at 4 mutation points |
| Modify | `packages/server/src/runs/routes.test.ts` | Assert emissions via spy |
| Create | `packages/web/src/hooks/useServerEvents.ts` | EventSource hook with cache invalidation |
| Modify | `packages/web/src/components/Layout.tsx` | Mount useServerEvents once for all routes |
| Modify | `packages/web/src/hooks/useRun.ts` | Remove refetchInterval |
| Modify | `packages/web/nginx.conf` | Add SSE-specific location with buffering disabled |

---

## Task 1: Create the event emitter module

**Files:**
- Create: `packages/server/src/events.ts`
- Create: `packages/server/src/events.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/server/src/events.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type RunEvent, runEmitter } from './events.js'

afterEach(() => {
  runEmitter.removeAllListeners()
})

describe('runEmitter', () => {
  it('delivers run:created events to listeners', () => {
    const handler = vi.fn()
    runEmitter.on('event', handler)
    const event: RunEvent = { type: 'run:created', runId: 'run-1' }
    runEmitter.emit('event', event)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('delivers run:updated events to listeners', () => {
    const handler = vi.fn()
    runEmitter.on('event', handler)
    const event: RunEvent = { type: 'run:updated', runId: 'run-2' }
    runEmitter.emit('event', event)
    expect(handler).toHaveBeenCalledWith(event)
  })

  it('does not deliver events to removed listeners', () => {
    const handler = vi.fn()
    runEmitter.on('event', handler)
    runEmitter.off('event', handler)
    runEmitter.emit('event', { type: 'run:created', runId: 'run-3' })
    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @playwright-cart/server test events
```

Expected: FAIL — `Cannot find module './events.js'`

- [ ] **Step 3: Create the events module**

```ts
// packages/server/src/events.ts
import { EventEmitter } from 'node:events'

export type RunEvent =
  | { type: 'run:created'; runId: string }
  | { type: 'run:updated'; runId: string }

class RunEventEmitter extends EventEmitter {}

export const runEmitter = new RunEventEmitter()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @playwright-cart/server test events
```

Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/events.ts packages/server/src/events.test.ts
git commit -m "feat(server): add typed run event emitter"
```

---

## Task 2: Emit events from route handlers

**Files:**
- Modify: `packages/server/src/runs/routes.ts`
- Modify: `packages/server/src/runs/routes.test.ts`

- [ ] **Step 1: Add spy-based emit assertions to existing route tests**

Add these `it` blocks inside the relevant `describe` blocks in `packages/server/src/runs/routes.test.ts`:

```ts
// Modify the existing vitest import at the top to add `vi`:
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Add this new import below the existing imports:
import { runEmitter } from '../events.js'
```

Inside `describe('POST /api/runs', ...)` add:

```ts
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
```

Inside `describe('POST /api/runs/:runId/tests', ...)` add:

```ts
it('emits run:updated after saving a test', async () => {
  storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-04T10:00:00.000Z', status: 'running' })
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
```

Inside `describe('POST /api/runs/:runId/complete', ...)` add:

```ts
it('emits run:updated after completing a run', async () => {
  storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-04T10:00:00.000Z', status: 'running' })
  const spy = vi.spyOn(runEmitter, 'emit')
  await runs.request('/run-1/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completedAt: '2026-04-04T10:05:00.000Z', status: 'passed' }),
  })
  expect(spy).toHaveBeenCalledWith('event', { type: 'run:updated', runId: 'run-1' })
  spy.mockRestore()
})
```

Inside `describe('POST /api/runs/:runId/report', ...)` add:

```ts
it('emits run:updated after uploading a report', async () => {
  const AdmZip = (await import('adm-zip')).default
  storage.createRun({ runId: 'run-1', project: 'p', startedAt: '2026-04-04T10:00:00.000Z', status: 'running' })
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
```

- [ ] **Step 2: Run tests to verify new assertions fail**

```bash
pnpm --filter @playwright-cart/server test routes
```

Expected: 4 new FAIL — emit spy never called

- [ ] **Step 3: Add emit calls to routes.ts**

Replace the full content of `packages/server/src/runs/routes.ts`:

```ts
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
  storage.createRun(run)
  runEmitter.emit('event', { type: 'run:created', runId } satisfies RunEvent)
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

runs.get('/:runId/tests/:testId', (c) => {
  const { runId, testId } = c.req.param()
  const run = storage.getRun(runId)
  if (!run) return c.json({ error: 'Not found' }, 404)
  const test = storage.getTestResult(runId, testId)
  if (!test) return c.json({ error: 'Not found' }, 404)
  return c.json(test)
})

runs.post('/:runId/complete', async (c) => {
  const runId = c.req.param('runId')
  const { completedAt, status } = await c.req.json<{
    completedAt: string
    status: storage.RunRecord['status']
  }>()
  storage.updateRun(runId, { completedAt, status })
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

  storage.writeTestResult(runId, metadata)
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
  storage.updateRun(runId, { completedAt, status, reportUrl })
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)

  return c.json({ reportUrl })
})
```

- [ ] **Step 4: Run all server tests**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/runs/routes.ts packages/server/src/runs/routes.test.ts
git commit -m "feat(server): emit run events from route handlers"
```

---

## Task 3: Add SSE endpoint

**Files:**
- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/app.test.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Write failing SSE endpoint tests**

```ts
// packages/server/src/app.test.ts
import { afterEach, describe, expect, it } from 'vitest'
import { app } from './app.js'
import { runEmitter } from './events.js'

afterEach(() => {
  runEmitter.removeAllListeners()
})

describe('GET /api/events', () => {
  it('responds with 200 and text/event-stream content type', async () => {
    const res = await app.request('/api/events')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    await res.body?.cancel()
  })

  it('streams a run:created event to the client', async () => {
    const res = await app.request('/api/events')
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    setTimeout(() => {
      runEmitter.emit('event', { type: 'run:created', runId: 'run-42' })
    }, 10)

    const { value } = await reader.read()
    const text = decoder.decode(value)

    expect(text).toContain('event: run:created')
    expect(text).toContain('"runId":"run-42"')

    await reader.cancel()
  })

  it('streams a run:updated event to the client', async () => {
    const res = await app.request('/api/events')
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    setTimeout(() => {
      runEmitter.emit('event', { type: 'run:updated', runId: 'run-99' })
    }, 10)

    const { value } = await reader.read()
    const text = decoder.decode(value)

    expect(text).toContain('event: run:updated')
    expect(text).toContain('"runId":"run-99"')

    await reader.cancel()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @playwright-cart/server test app
```

Expected: FAIL — `Cannot find module './app.js'`

- [ ] **Step 3: Create app.ts (extract app setup from index.ts, add SSE route)**

```ts
// packages/server/src/app.ts
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { streamSSE } from 'hono/streaming'
import { type RunEvent, runEmitter } from './events.js'
import { runs } from './runs/routes.js'

export const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors())

app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    const send = (event: RunEvent) => {
      stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
    }
    runEmitter.on('event', send)
    stream.onAbort(() => runEmitter.off('event', send))
    await stream.sleep(Infinity)
  }),
)

app.route('/api/runs', runs)

app.use('/reports/*', cors())
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
app.use(
  '/reports/*',
  serveStatic({
    root: process.env.DATA_DIR ?? './data',
    rewriteRequestPath: (path) => path.replace(/^\/reports/, ''),
  }),
)
```

- [ ] **Step 4: Replace index.ts to import from app.ts**

```ts
// packages/server/src/index.ts
import { serve } from '@hono/node-server'
import { app } from './app.js'

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[playwright-cart/server] listening on http://localhost:${port}`)
})
```

- [ ] **Step 5: Run all server tests**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests PASS including the 3 new SSE tests

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/app.test.ts packages/server/src/index.ts
git commit -m "feat(server): add SSE /api/events endpoint via hono/streaming"
```

---

## Task 4: Frontend — useServerEvents hook + remove polling

**Files:**
- Create: `packages/web/src/hooks/useServerEvents.ts`
- Modify: `packages/web/src/components/Layout.tsx`
- Modify: `packages/web/src/hooks/useRun.ts`

- [ ] **Step 1: Create useServerEvents hook**

```ts
// packages/web/src/hooks/useServerEvents.ts
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

export function useServerEvents() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const es = new EventSource('/api/events')

    es.addEventListener('run:created', () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    })

    es.addEventListener('run:updated', (e: MessageEvent) => {
      const { runId } = JSON.parse(e.data) as { runId: string }
      queryClient.invalidateQueries({ queryKey: ['run', runId] })
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    })

    // Invalidate on reconnect to catch any events missed during disconnection
    es.addEventListener('open', () => {
      queryClient.invalidateQueries({ queryKey: ['runs'] })
    })

    return () => es.close()
  }, [queryClient])
}
```

- [ ] **Step 2: Mount useServerEvents in Layout**

Replace the content of `packages/web/src/components/Layout.tsx`:

```tsx
import { Outlet } from 'react-router-dom'
import { useServerEvents } from '../hooks/useServerEvents.js'
import TopNav from './TopNav.js'

export default function Layout() {
  useServerEvents()
  return (
    <div className="min-h-screen bg-tn-bg text-tn-fg">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Remove polling from useRun**

Replace the content of `packages/web/src/hooks/useRun.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchRun } from '../lib/api.js'

export function useRun(runId: string) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => fetchRun(runId),
  })
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/hooks/useServerEvents.ts packages/web/src/components/Layout.tsx packages/web/src/hooks/useRun.ts
git commit -m "feat(web): add SSE live updates hook, remove polling from useRun"
```

---

## Task 5: Update nginx for SSE

**Files:**
- Modify: `packages/web/nginx.conf`

- [ ] **Step 1: Add SSE location block to nginx.conf**

The new block must appear before the existing `/api/` block (nginx uses longest-prefix matching, but explicit ordering is clearer). Replace the content of `packages/web/nginx.conf`:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  # SPA fallback — all unmatched routes serve index.html
  location / {
    try_files $uri $uri/ /index.html;
  }

  # SSE endpoint — disable buffering so events reach clients immediately
  location /api/events {
    proxy_pass http://server:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
  }

  # Proxy API requests to the server container
  location /api/ {
    proxy_pass http://server:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  # Proxy report static files to the server container.
  # Range requests must pass through for the trace viewer's HttpRangeReader.
  location /reports/ {
    proxy_pass http://server:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Range $http_range;
    proxy_set_header If-Range $http_if_range;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/nginx.conf
git commit -m "fix(web/nginx): disable buffering for SSE /api/events endpoint"
```

---

## Task 6: End-to-end verification

- [ ] **Step 1: Start the dev stack**

```bash
pnpm dev
```

Open `http://localhost:5173` in a browser. Keep the network tab open (filter by `events` to see the SSE connection).

- [ ] **Step 2: Verify SSE connection is established**

In the network tab, confirm a `GET /api/events` request is open with status 200 and type `eventsource`.

- [ ] **Step 3: Post a new run and verify it appears without refresh**

```bash
curl -X POST http://localhost:3001/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"project":"demo","startedAt":"2026-04-04T10:00:00.000Z"}'
```

Expected: the new run appears in the dashboard immediately without a manual refresh.

- [ ] **Step 4: Complete the run and verify status updates**

Copy the `runId` from the curl response above, then:

```bash
curl -X POST http://localhost:3001/api/runs/<runId>/complete \
  -H 'Content-Type: application/json' \
  -d '{"completedAt":"2026-04-04T10:01:00.000Z","status":"passed"}'
```

Expected: navigate to the run detail page — status changes to `passed` without a manual refresh.

- [ ] **Step 5: Run full test suite**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: all tests PASS.
