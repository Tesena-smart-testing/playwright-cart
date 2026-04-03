# Frontend Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React dashboard for viewing Playwright test runs, per-test results, statistics, and HTML reports with TokyoNight theming and dark/light/system toggle.

**Architecture:** Extend the existing Hono server with one new read endpoint (`GET /api/runs/:runId/tests/:testId`). The React frontend (`packages/web`) adds React Router v6 for routing, TanStack Query v5 for data fetching with live polling, and Tailwind CSS v4 for styling. Three pages: runs list, run detail, test detail.

**Tech Stack:** React 19, React Router v6, TanStack Query v5, Tailwind CSS v4, Vitest (web + server tests), TypeScript 5.7, Hono (server), Vite 6.

---

## File Map

### Server (packages/server)
- Modify: `src/runs/storage.ts` — add `getTestResult(runId, testId)`
- Modify: `src/runs/routes.ts` — add `GET /:runId/tests/:testId` route
- Modify: `src/runs/routes.test.ts` — add tests for new endpoint

### Web (packages/web)
- Modify: `index.html` — add FOUC-prevention theme script
- Modify: `vite.config.ts` — add Tailwind plugin + Vitest config
- Modify: `package.json` — add new dependencies + test scripts
- Modify: `src/main.tsx` — add `QueryClientProvider`, CSS import
- Modify: `src/App.tsx` — rewrite: `BrowserRouter` + `Routes` + `Layout`

**New files — lib:**
- `src/index.css` — Tailwind import + TokyoNight CSS custom properties
- `src/lib/api.ts` — types (`RunRecord`, `TestRecord`, etc.) + typed fetch functions
- `src/lib/theme.ts` — `getStoredTheme`, `applyTheme`, `cycleTheme` (pure functions)
- `src/lib/format.ts` — `formatRelativeTime`, `formatDuration`

**New files — hooks:**
- `src/hooks/useTheme.ts`
- `src/hooks/useRuns.ts`
- `src/hooks/useRun.ts`
- `src/hooks/useTest.ts`

**New files — components:**
- `src/components/Layout.tsx` — top nav + `<Outlet />`
- `src/components/TopNav.tsx` — logo + theme toggle button
- `src/components/StatusBadge.tsx` — coloured pill for run/test status
- `src/components/StatsBar.tsx` — 3 stat cards (total, pass rate, failed)
- `src/components/FilterBar.tsx` — project / branch / status dropdowns + URL param sync + `applyFilters`
- `src/components/RunsTable.tsx` — table rows linking to run detail
- `src/components/RunHeader.tsx` — project, branch, commit, status, "Open Report ↗"
- `src/components/RunStats.tsx` — passed/failed/skipped/timedOut counts
- `src/components/SuiteGroup.tsx` — collapsible suite with test rows
- `src/components/ErrorBlock.tsx` — error message + stack trace
- `src/components/AttachmentList.tsx` — download links + trace viewer link

**New files — pages:**
- `src/pages/RunsPage.tsx`
- `src/pages/RunDetailPage.tsx`
- `src/pages/TestDetailPage.tsx`

**New files — tests:**
- `src/lib/api.test.ts`
- `src/lib/theme.test.ts`

---

## Task 1: Server — add `getTestResult` and new route (TDD)

**Files:**
- Modify: `packages/server/src/runs/storage.ts`
- Modify: `packages/server/src/runs/routes.ts`
- Modify: `packages/server/src/runs/routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `packages/server/src/runs/routes.test.ts`:

```typescript
describe('GET /api/runs/:runId/tests/:testId', () => {
  it('returns 404 when run does not exist', async () => {
    const res = await runs.request('/no-such-run/tests/test-1')
    expect(res.status).toBe(404)
  })

  it('returns 404 when test does not exist', async () => {
    storage.createRun({
      runId: 'run-1',
      project: 'p',
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const res = await runs.request('/run-1/tests/no-such-test')
    expect(res.status).toBe(404)
  })

  it('returns the test record', async () => {
    storage.createRun({
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
    storage.writeTestResult('run-1', test)
    const res = await runs.request('/run-1/tests/my-test')
    expect(res.status).toBe(200)
    const body = (await res.json()) as storage.TestRecord
    expect(body.testId).toBe('my-test')
    expect(body.title).toBe('my test')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: 3 new tests fail with "runs.request is not a function" or route-not-found errors.

- [ ] **Step 3: Add `getTestResult` to `storage.ts`**

Add after the `getTestResults` function in `packages/server/src/runs/storage.ts`:

```typescript
export function getTestResult(runId: string, testId: string): TestRecord | null {
  const path = join(storageConfig.dataDir, runId, 'tests', `${testId}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as TestRecord
}
```

- [ ] **Step 4: Add the route to `routes.ts`**

Add after the `runs.get('/:runId', ...)` handler in `packages/server/src/runs/routes.ts`:

```typescript
runs.get('/:runId/tests/:testId', (c) => {
  const { runId, testId } = c.req.param()
  const run = storage.getRun(runId)
  if (!run) return c.json({ error: 'Not found' }, 404)
  const test = storage.getTestResult(runId, testId)
  if (!test) return c.json({ error: 'Not found' }, 404)
  return c.json(test)
})
```

- [ ] **Step 5: Run tests and confirm all pass**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: All tests pass, including the 3 new ones.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/runs/storage.ts packages/server/src/runs/routes.ts packages/server/src/runs/routes.test.ts
git commit -m "feat(server): add GET /api/runs/:runId/tests/:testId endpoint"
```

---

## Task 2: Web — install dependencies

**Files:**
- Modify: `packages/web/package.json`
- Modify: `packages/web/vite.config.ts`

- [ ] **Step 1: Install runtime dependencies**

```bash
pnpm --filter @playwright-cart/web add react-router-dom @tanstack/react-query
```

- [ ] **Step 2: Install Tailwind CSS v4**

```bash
pnpm --filter @playwright-cart/web add -D tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Install Vitest**

```bash
pnpm --filter @playwright-cart/web add -D vitest
```

- [ ] **Step 4: Add test scripts to `packages/web/package.json`**

In the `"scripts"` section add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Update `packages/web/vite.config.ts`**

Replace the file entirely:

```typescript
/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/reports': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    globals: true,
  },
})
```

- [ ] **Step 6: Verify build still works**

```bash
pnpm --filter @playwright-cart/web build
```

Expected: Build succeeds (Tailwind will produce minimal output since no classes are used yet).

- [ ] **Step 7: Commit**

```bash
git add packages/web/package.json packages/web/vite.config.ts
git commit -m "chore(web): add react-router-dom, tanstack-query, tailwindcss, vitest"
```

---

## Task 3: Web — theme system

**Files:**
- Create: `packages/web/src/index.css`
- Create: `packages/web/src/lib/theme.ts`
- Create: `packages/web/src/lib/theme.test.ts`
- Create: `packages/web/src/hooks/useTheme.ts`
- Modify: `packages/web/index.html`

- [ ] **Step 1: Write failing tests for `theme.ts`**

Create `packages/web/src/lib/theme.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { cycleTheme, type Theme } from './theme.js'

describe('cycleTheme', () => {
  it('cycles system → dark → light → system', () => {
    expect(cycleTheme('system')).toBe('dark')
    expect(cycleTheme('dark')).toBe('light')
    expect(cycleTheme('light')).toBe('system')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: FAIL — `theme.js` does not exist.

- [ ] **Step 3: Create `packages/web/src/lib/theme.ts`**

```typescript
export type Theme = 'dark' | 'light' | 'system'

const CYCLE_ORDER: Theme[] = ['system', 'dark', 'light']

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem('theme')
  return stored === 'dark' || stored === 'light' ? stored : 'system'
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
    localStorage.removeItem('theme')
  } else {
    root.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }
}

export function cycleTheme(current: Theme): Theme {
  return CYCLE_ORDER[(CYCLE_ORDER.indexOf(current) + 1) % CYCLE_ORDER.length]
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: All tests pass.

- [ ] **Step 5: Create `packages/web/src/hooks/useTheme.ts`**

```typescript
import { useCallback, useState } from 'react'
import { applyTheme, cycleTheme, getStoredTheme, type Theme } from '../lib/theme.js'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  const toggle = useCallback(() => {
    const next = cycleTheme(theme)
    applyTheme(next)
    setTheme(next)
  }, [theme])

  return { theme, toggle }
}
```

- [ ] **Step 6: Create `packages/web/src/index.css`**

```css
@import "tailwindcss";

/* ── TokyoNight Dark (default) ──────────────────── */
:root {
  --tn-bg:        #1a1b26;
  --tn-panel:     #16161e;
  --tn-highlight: #292e42;
  --tn-fg:        #c0caf5;
  --tn-muted:     #565f89;
  --tn-blue:      #7aa2f7;
  --tn-purple:    #bb9af7;
  --tn-green:     #9ece6a;
  --tn-red:       #f7768e;
  --tn-yellow:    #e0af68;
  --tn-border:    #292e42;
}

/* ── TokyoNight Day ─────────────────────────────── */
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --tn-bg:        #e1e2e7;
    --tn-panel:     #d0d5e3;
    --tn-highlight: #c4c8da;
    --tn-fg:        #3760bf;
    --tn-muted:     #848cb5;
    --tn-blue:      #2e7de9;
    --tn-purple:    #9854f1;
    --tn-green:     #587539;
    --tn-red:       #f52a65;
    --tn-yellow:    #8c6c3e;
    --tn-border:    #c4c8da;
  }
}

:root[data-theme="light"] {
  --tn-bg:        #e1e2e7;
  --tn-panel:     #d0d5e3;
  --tn-highlight: #c4c8da;
  --tn-fg:        #3760bf;
  --tn-muted:     #848cb5;
  --tn-blue:      #2e7de9;
  --tn-purple:    #9854f1;
  --tn-green:     #587539;
  --tn-red:       #f52a65;
  --tn-yellow:    #8c6c3e;
  --tn-border:    #c4c8da;
}

:root[data-theme="dark"] {
  --tn-bg:        #1a1b26;
  --tn-panel:     #16161e;
  --tn-highlight: #292e42;
  --tn-fg:        #c0caf5;
  --tn-muted:     #565f89;
  --tn-blue:      #7aa2f7;
  --tn-purple:    #bb9af7;
  --tn-green:     #9ece6a;
  --tn-red:       #f7768e;
  --tn-yellow:    #e0af68;
  --tn-border:    #292e42;
}

/* ── Register with Tailwind v4 ──────────────────── */
@theme inline {
  --color-tn-bg:        var(--tn-bg);
  --color-tn-panel:     var(--tn-panel);
  --color-tn-highlight: var(--tn-highlight);
  --color-tn-fg:        var(--tn-fg);
  --color-tn-muted:     var(--tn-muted);
  --color-tn-blue:      var(--tn-blue);
  --color-tn-purple:    var(--tn-purple);
  --color-tn-green:     var(--tn-green);
  --color-tn-red:       var(--tn-red);
  --color-tn-yellow:    var(--tn-yellow);
  --color-tn-border:    var(--tn-border);
}

/* ── Base ────────────────────────────────────────── */
body {
  background-color: var(--tn-bg);
  color: var(--tn-fg);
}
```

- [ ] **Step 7: Update `packages/web/index.html` — add FOUC prevention script**

Replace the file entirely:

```html
<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Playwright Cart</title>
    <script>
      (function () {
        var stored = localStorage.getItem('theme')
        var theme = stored === 'dark' || stored === 'light'
          ? stored
          : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
        document.documentElement.setAttribute('data-theme', theme)
      })()
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/index.css packages/web/src/lib/theme.ts packages/web/src/lib/theme.test.ts packages/web/src/hooks/useTheme.ts packages/web/index.html
git commit -m "feat(web): add TokyoNight theme system with dark/light/system toggle"
```

---

## Task 4: Web — API types, fetch functions, and tests

**Files:**
- Create: `packages/web/src/lib/api.ts`
- Create: `packages/web/src/lib/api.test.ts`
- Create: `packages/web/src/lib/format.ts`
- Create: `packages/web/src/hooks/useRuns.ts`
- Create: `packages/web/src/hooks/useRun.ts`
- Create: `packages/web/src/hooks/useTest.ts`

- [ ] **Step 1: Write failing tests for `api.ts`**

Create `packages/web/src/lib/api.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRun, fetchRuns, fetchTest, NotFoundError } from './api.js'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchRuns', () => {
  it('fetches /api/runs and returns the array', async () => {
    const mockRuns = [{ runId: 'run-1', project: 'my-app', startedAt: '2026-04-02T10:00:00.000Z', status: 'passed' }]
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockRuns), { status: 200 }))

    const result = await fetchRuns()

    expect(fetch).toHaveBeenCalledWith('/api/runs')
    expect(result).toEqual(mockRuns)
  })

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500 }))
    await expect(fetchRuns()).rejects.toThrow('HTTP 500')
  })
})

describe('fetchRun', () => {
  it('fetches /api/runs/:runId and returns run with tests', async () => {
    const mockRun = { runId: 'run-1', project: 'p', startedAt: '2026-04-02T10:00:00.000Z', status: 'passed', tests: [] }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockRun), { status: 200 }))

    const result = await fetchRun('run-1')

    expect(fetch).toHaveBeenCalledWith('/api/runs/run-1')
    expect(result).toEqual(mockRun)
  })

  it('throws NotFoundError on 404', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }))
    await expect(fetchRun('no-such-run')).rejects.toThrow(NotFoundError)
  })
})

describe('fetchTest', () => {
  it('fetches /api/runs/:runId/tests/:testId and returns test', async () => {
    const mockTest = { testId: 'test-1', title: 'my test' }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockTest), { status: 200 }))

    const result = await fetchTest('run-1', 'test-1')

    expect(fetch).toHaveBeenCalledWith('/api/runs/run-1/tests/test-1')
    expect(result).toEqual(mockTest)
  })

  it('throws NotFoundError on 404', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 404 }))
    await expect(fetchTest('run-1', 'no-such')).rejects.toThrow(NotFoundError)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: FAIL — `api.js` does not exist.

- [ ] **Step 3: Create `packages/web/src/lib/api.ts`**

```typescript
export type RunStatus = 'running' | 'passed' | 'failed' | 'interrupted' | 'timedOut'
export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'

export interface RunRecord {
  runId: string
  project: string
  branch?: string
  commitSha?: string
  startedAt: string
  completedAt?: string
  status: RunStatus
  reportUrl?: string
}

export interface TestRecord {
  testId: string
  title: string
  titlePath: string[]
  location: { file: string; line: number; column: number }
  status: TestStatus
  duration: number
  errors: Array<{ message: string; stack?: string }>
  retry: number
  annotations: Array<{ type: string; description?: string }>
  attachments: Array<{ name: string; contentType: string; filename?: string }>
}

export type RunWithTests = RunRecord & { tests: TestRecord[] }

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export async function fetchRuns(): Promise<RunRecord[]> {
  const res = await fetch('/api/runs')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<RunRecord[]>
}

export async function fetchRun(runId: string): Promise<RunWithTests> {
  const res = await fetch(`/api/runs/${runId}`)
  if (res.status === 404) throw new NotFoundError('Run not found')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<RunWithTests>
}

export async function fetchTest(runId: string, testId: string): Promise<TestRecord> {
  const res = await fetch(`/api/runs/${runId}/tests/${testId}`)
  if (res.status === 404) throw new NotFoundError('Test not found')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<TestRecord>
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: All tests pass (theme tests + api tests).

- [ ] **Step 5: Create `packages/web/src/lib/format.ts`**

```typescript
export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.round((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}
```

- [ ] **Step 6: Create `packages/web/src/hooks/useRuns.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { fetchRuns } from '../lib/api.js'

export function useRuns() {
  return useQuery({
    queryKey: ['runs'],
    queryFn: fetchRuns,
    staleTime: 30_000,
  })
}
```

- [ ] **Step 7: Create `packages/web/src/hooks/useRun.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { fetchRun } from '../lib/api.js'

export function useRun(runId: string) {
  return useQuery({
    queryKey: ['run', runId],
    queryFn: () => fetchRun(runId),
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 5000 : false,
  })
}
```

- [ ] **Step 8: Create `packages/web/src/hooks/useTest.ts`**

```typescript
import { useQuery } from '@tanstack/react-query'
import { fetchTest } from '../lib/api.js'

export function useTest(runId: string, testId: string) {
  return useQuery({
    queryKey: ['test', runId, testId],
    queryFn: () => fetchTest(runId, testId),
  })
}
```

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/lib/api.ts packages/web/src/lib/api.test.ts packages/web/src/lib/format.ts packages/web/src/hooks/useRuns.ts packages/web/src/hooks/useRun.ts packages/web/src/hooks/useTest.ts
git commit -m "feat(web): add API types, fetch functions, and TanStack Query hooks"
```

---

## Task 5: Web — routing, providers, base components

**Files:**
- Modify: `packages/web/src/main.tsx`
- Modify: `packages/web/src/App.tsx`
- Create: `packages/web/src/components/Layout.tsx`
- Create: `packages/web/src/components/TopNav.tsx`
- Create: `packages/web/src/components/StatusBadge.tsx`

- [ ] **Step 1: Update `packages/web/src/main.tsx`**

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.js'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: Rewrite `packages/web/src/App.tsx`**

```typescript
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.js'
import RunDetailPage from './pages/RunDetailPage.js'
import RunsPage from './pages/RunsPage.js'
import TestDetailPage from './pages/TestDetailPage.js'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<RunsPage />} />
          <Route path="runs/:runId" element={<RunDetailPage />} />
          <Route path="runs/:runId/tests/:testId" element={<TestDetailPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 3: Create `packages/web/src/components/Layout.tsx`**

```typescript
import { Outlet } from 'react-router-dom'
import TopNav from './TopNav.js'

export default function Layout() {
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

- [ ] **Step 4: Create `packages/web/src/components/TopNav.tsx`**

```typescript
import { useTheme } from '../hooks/useTheme.js'
import type { Theme } from '../lib/theme.js'

const THEME_ICONS: Record<Theme, string> = {
  system: '💻',
  dark: '🌙',
  light: '☀️',
}

const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
}

export default function TopNav() {
  const { theme, toggle } = useTheme()

  return (
    <nav className="border-b border-tn-border bg-tn-panel px-4 py-3">
      <div className="mx-auto flex max-w-6xl items-center">
        <a href="/" className="text-lg font-bold text-tn-purple hover:opacity-80 transition-opacity">
          🎭 Playwright Cart
        </a>
        <div className="ml-auto">
          <button
            type="button"
            onClick={toggle}
            title={`Theme: ${THEME_LABELS[theme]} — click to cycle`}
            className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-tn-muted hover:bg-tn-highlight hover:text-tn-fg transition-colors"
          >
            <span>{THEME_ICONS[theme]}</span>
            <span>{THEME_LABELS[theme]}</span>
          </button>
        </div>
      </div>
    </nav>
  )
}
```

- [ ] **Step 5: Create `packages/web/src/components/StatusBadge.tsx`**

```typescript
import type { RunStatus, TestStatus } from '../lib/api.js'

type Status = RunStatus | TestStatus

const STYLES: Record<Status, string> = {
  passed:      'bg-tn-green/20 text-tn-green',
  failed:      'bg-tn-red/20 text-tn-red',
  running:     'bg-tn-yellow/20 text-tn-yellow',
  timedOut:    'bg-tn-yellow/20 text-tn-yellow',
  interrupted: 'bg-tn-muted/20 text-tn-muted',
  skipped:     'bg-tn-muted/20 text-tn-muted',
}

const DOTS: Record<Status, string> = {
  passed:      '●',
  failed:      '●',
  running:     '◌',
  timedOut:    '●',
  interrupted: '●',
  skipped:     '○',
}

export default function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      <span>{DOTS[status]}</span>
      {status}
    </span>
  )
}
```

- [ ] **Step 6: Create placeholder page files so the app compiles**

Create `packages/web/src/pages/RunsPage.tsx`:
```typescript
export default function RunsPage() {
  return <p className="text-tn-muted">Runs page — coming soon</p>
}
```

Create `packages/web/src/pages/RunDetailPage.tsx`:
```typescript
export default function RunDetailPage() {
  return <p className="text-tn-muted">Run detail — coming soon</p>
}
```

Create `packages/web/src/pages/TestDetailPage.tsx`:
```typescript
export default function TestDetailPage() {
  return <p className="text-tn-muted">Test detail — coming soon</p>
}
```

- [ ] **Step 7: Start dev server and verify routing works**

```bash
pnpm --filter @playwright-cart/server dev &
pnpm --filter @playwright-cart/web dev
```

Open `http://localhost:5173` — you should see the nav bar with the theme toggle and "Runs page — coming soon". Navigate to `/runs/test-id` — "Run detail — coming soon". Theme toggle should cycle through the three modes.

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/main.tsx packages/web/src/App.tsx packages/web/src/components/Layout.tsx packages/web/src/components/TopNav.tsx packages/web/src/components/StatusBadge.tsx packages/web/src/pages/
git commit -m "feat(web): add routing, QueryClient provider, Layout, TopNav, StatusBadge"
```

---

## Task 6: Web — RunsPage

**Files:**
- Modify: `packages/web/src/pages/RunsPage.tsx`
- Create: `packages/web/src/components/StatsBar.tsx`
- Create: `packages/web/src/components/FilterBar.tsx`
- Create: `packages/web/src/components/RunsTable.tsx`

- [ ] **Step 1: Create `packages/web/src/components/StatsBar.tsx`**

```typescript
import type { RunRecord } from '../lib/api.js'

interface Props {
  runs: RunRecord[]
}

export default function StatsBar({ runs }: Props) {
  const completed = runs.filter((r) => r.status !== 'running')
  const passed = runs.filter((r) => r.status === 'passed').length
  const failed = runs.filter((r) => r.status === 'failed').length
  const passRate =
    completed.length > 0 ? Math.round((passed / completed.length) * 100) : 0

  return (
    <div className="mb-6 grid grid-cols-3 gap-4">
      <StatCard label="Total runs" value={runs.length} />
      <StatCard label="Pass rate" value={`${passRate}%`} valueClass="text-tn-green" />
      <StatCard
        label="Failed"
        value={failed}
        valueClass={failed > 0 ? 'text-tn-red' : 'text-tn-fg'}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  valueClass = 'text-tn-fg',
}: {
  label: string
  value: string | number
  valueClass?: string
}) {
  return (
    <div className="rounded-lg border border-tn-border bg-tn-panel p-4 text-center">
      <div className={`text-2xl font-bold ${valueClass}`}>{value}</div>
      <div className="mt-1 text-sm text-tn-muted">{label}</div>
    </div>
  )
}
```

- [ ] **Step 2: Create `packages/web/src/components/FilterBar.tsx`**

```typescript
import { useSearchParams } from 'react-router-dom'
import type { RunRecord, RunStatus } from '../lib/api.js'

const ALL_STATUSES: RunStatus[] = ['running', 'passed', 'failed', 'interrupted', 'timedOut']

interface Props {
  runs: RunRecord[]
}

export function FilterBar({ runs }: Props) {
  const [params, setParams] = useSearchParams()

  const projects = [...new Set(runs.map((r) => r.project))].sort()
  const branches = [
    ...new Set(runs.map((r) => r.branch).filter((b): b is string => Boolean(b))),
  ].sort()

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
    <div className="mb-4 flex gap-3">
      <FilterSelect
        label="Project"
        value={project}
        onChange={(v) => setParam('project', v)}
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect
        label="Branch"
        value={branch}
        onChange={(v) => setParam('branch', v)}
      >
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </FilterSelect>
      <FilterSelect
        label="Status"
        value={status}
        onChange={(v) => setParam('status', v)}
      >
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

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-tn-border bg-tn-highlight px-3 py-1.5 text-sm text-tn-fg focus:outline-none focus:ring-1 focus:ring-tn-blue"
    >
      {children}
    </select>
  )
}

export function applyFilters(runs: RunRecord[], params: URLSearchParams): RunRecord[] {
  const project = params.get('project')
  const branch = params.get('branch')
  const status = params.get('status') as RunStatus | null
  return runs.filter((r) => {
    if (project && r.project !== project) return false
    if (branch && r.branch !== branch) return false
    if (status && r.status !== status) return false
    return true
  })
}
```

- [ ] **Step 3: Create `packages/web/src/components/RunsTable.tsx`**

```typescript
import { Link } from 'react-router-dom'
import type { RunRecord } from '../lib/api.js'
import { formatRelativeTime } from '../lib/format.js'
import StatusBadge from './StatusBadge.js'

interface Props {
  runs: RunRecord[]
}

export default function RunsTable({ runs }: Props) {
  if (runs.length === 0) {
    return (
      <p className="py-8 text-center text-tn-muted">
        No runs match the current filters.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-tn-border bg-tn-panel">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-tn-border bg-tn-bg">
            {['Project / Branch', 'Commit', 'Status', 'When', ''].map((h) => (
              <th
                key={h}
                className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-tn-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-tn-border">
          {runs.map((run) => (
            <tr key={run.runId} className="transition-colors hover:bg-tn-highlight">
              <td className="px-4 py-3">
                <div className="font-medium text-tn-fg">{run.project}</div>
                {run.branch && (
                  <div className="text-xs text-tn-blue">{run.branch}</div>
                )}
              </td>
              <td className="px-4 py-3">
                {run.commitSha ? (
                  <code className="text-xs text-tn-muted">
                    {run.commitSha.slice(0, 7)}
                  </code>
                ) : (
                  <span className="text-xs text-tn-muted">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={run.status} />
              </td>
              <td className="px-4 py-3 text-xs text-tn-muted">
                {formatRelativeTime(run.startedAt)}
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  to={`/runs/${run.runId}`}
                  className="text-xs font-medium text-tn-blue transition-colors hover:text-tn-purple"
                >
                  View →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Replace `packages/web/src/pages/RunsPage.tsx`**

```typescript
import { useSearchParams } from 'react-router-dom'
import { FilterBar, applyFilters } from '../components/FilterBar.js'
import RunsTable from '../components/RunsTable.js'
import StatsBar from '../components/StatsBar.js'
import { useRuns } from '../hooks/useRuns.js'

export default function RunsPage() {
  const [params] = useSearchParams()
  const { data: runs, isLoading, error, refetch } = useRuns()

  if (isLoading) return <Skeleton />

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="mb-2 text-tn-red">Failed to load runs.</p>
        <p className="mb-4 text-sm text-tn-muted">{error.message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded border border-tn-border px-4 py-2 text-sm text-tn-fg transition-colors hover:bg-tn-highlight"
        >
          Retry
        </button>
      </div>
    )
  }

  if (runs.length === 0) return <EmptyState />

  const filtered = applyFilters(runs, params)

  return (
    <div>
      <StatsBar runs={runs} />
      <FilterBar runs={runs} />
      <RunsTable runs={filtered} />
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-tn-highlight" />
        ))}
      </div>
      <div className="h-8 w-64 rounded bg-tn-highlight" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-12 rounded bg-tn-highlight" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <p className="mb-4 text-4xl">🎭</p>
      <h2 className="mb-2 text-lg font-semibold text-tn-fg">No test runs yet</h2>
      <p className="mb-6 text-sm text-tn-muted">
        Add the reporter to your Playwright config to get started:
      </p>
      <pre className="mx-auto max-w-xl overflow-x-auto rounded-lg border border-tn-border bg-tn-panel p-4 text-left text-xs text-tn-fg">
        {`// playwright.config.ts
reporter: [
  ['html'],
  ['@playwright-cart/reporter', {
    serverUrl: 'http://localhost:3001',
    project: 'my-app',
  }],
]`}
      </pre>
    </div>
  )
}
```

- [ ] **Step 5: Verify in browser**

Ensure server is running (`pnpm --filter @playwright-cart/server dev`), then open `http://localhost:5173`.
- If no data: empty state with config snippet renders.
- If data exists: stats bar, filter dropdowns, and runs table render. Changing a filter updates the URL (`?status=passed`). Back/forward browser navigation preserves filters.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/RunsPage.tsx packages/web/src/components/StatsBar.tsx packages/web/src/components/FilterBar.tsx packages/web/src/components/RunsTable.tsx
git commit -m "feat(web): implement RunsPage with stats, filters, and runs table"
```

---

## Task 7: Web — RunDetailPage

**Files:**
- Modify: `packages/web/src/pages/RunDetailPage.tsx`
- Create: `packages/web/src/components/RunHeader.tsx`
- Create: `packages/web/src/components/RunStats.tsx`
- Create: `packages/web/src/components/SuiteGroup.tsx`

- [ ] **Step 1: Create `packages/web/src/components/RunHeader.tsx`**

```typescript
import type { RunWithTests } from '../lib/api.js'
import StatusBadge from './StatusBadge.js'

interface Props {
  run: RunWithTests
}

export default function RunHeader({ run }: Props) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-tn-fg">{run.project}</h1>
          <StatusBadge status={run.status} />
        </div>
        <div className="space-x-3 text-sm text-tn-muted">
          {run.branch && <span className="text-tn-blue">{run.branch}</span>}
          {run.commitSha && (
            <code className="text-tn-muted">{run.commitSha.slice(0, 7)}</code>
          )}
          <span>{new Date(run.startedAt).toLocaleString()}</span>
        </div>
      </div>
      {run.reportUrl && (
        <a
          href={run.reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-tn-blue px-4 py-2 text-sm text-tn-blue transition-colors hover:bg-tn-blue/10"
        >
          Open Report ↗
        </a>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `packages/web/src/components/RunStats.tsx`**

```typescript
import type { TestRecord } from '../lib/api.js'

interface Props {
  tests: TestRecord[]
}

export default function RunStats({ tests }: Props) {
  const passed = tests.filter((t) => t.status === 'passed').length
  const failed = tests.filter((t) => t.status === 'failed').length
  const timedOut = tests.filter((t) => t.status === 'timedOut').length
  const skipped = tests.filter((t) => t.status === 'skipped').length

  return (
    <div className="mb-6 flex gap-4 text-sm">
      <span className="text-tn-green">{passed} passed</span>
      {failed > 0 && <span className="text-tn-red">{failed} failed</span>}
      {timedOut > 0 && <span className="text-tn-yellow">{timedOut} timed out</span>}
      {skipped > 0 && <span className="text-tn-muted">{skipped} skipped</span>}
      <span className="text-tn-muted">/ {tests.length} total</span>
    </div>
  )
}
```

- [ ] **Step 3: Create `packages/web/src/components/SuiteGroup.tsx`**

```typescript
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { TestRecord, TestStatus } from '../lib/api.js'
import { formatDuration } from '../lib/format.js'

interface Props {
  runId: string
  suite: string
  tests: TestRecord[]
}

export default function SuiteGroup({ runId, suite, tests }: Props) {
  const [open, setOpen] = useState(true)
  const failed = tests.filter(
    (t) => t.status === 'failed' || t.status === 'timedOut',
  ).length

  return (
    <div className="overflow-hidden rounded-lg border border-tn-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 bg-tn-highlight px-4 py-3 text-left transition-colors hover:bg-tn-border/50"
      >
        <span className="text-sm text-tn-purple">{open ? '▾' : '▸'}</span>
        <span className="font-medium text-tn-fg">{suite}</span>
        <span className="ml-auto text-xs">
          {failed > 0 ? (
            <span className="text-tn-red">{failed} failed</span>
          ) : (
            <span className="text-tn-green">{tests.length} passed</span>
          )}
        </span>
      </button>
      {open && (
        <div className="divide-y divide-tn-border bg-tn-panel">
          {tests.map((test) => (
            <Link
              key={test.testId}
              to={`/runs/${runId}/tests/${test.testId}`}
              className="flex items-center gap-3 px-4 py-2.5 pl-8 transition-colors hover:bg-tn-highlight"
            >
              <TestStatusIcon status={test.status} />
              <span className="flex-1 text-sm text-tn-fg">{test.title}</span>
              <span className="text-xs text-tn-muted">
                {formatDuration(test.duration)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

const STATUS_ICON: Record<TestStatus, { icon: string; className: string }> = {
  passed:      { icon: '✓', className: 'text-tn-green' },
  failed:      { icon: '✗', className: 'text-tn-red' },
  timedOut:    { icon: '⏱', className: 'text-tn-yellow' },
  skipped:     { icon: '○', className: 'text-tn-muted' },
  interrupted: { icon: '!', className: 'text-tn-muted' },
}

function TestStatusIcon({ status }: { status: TestStatus }) {
  const { icon, className } = STATUS_ICON[status]
  return <span className={`font-mono text-sm ${className}`}>{icon}</span>
}
```

- [ ] **Step 4: Replace `packages/web/src/pages/RunDetailPage.tsx`**

```typescript
import { Link, useParams } from 'react-router-dom'
import RunHeader from '../components/RunHeader.js'
import RunStats from '../components/RunStats.js'
import SuiteGroup from '../components/SuiteGroup.js'
import { useRun } from '../hooks/useRun.js'
import type { TestRecord } from '../lib/api.js'

export default function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>()
  const { data: run, isLoading, error } = useRun(runId!)

  if (isLoading) return <Skeleton />

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-tn-muted">
          {error.name === 'NotFoundError' ? 'Run not found.' : error.message}
        </p>
        <Link to="/" className="text-tn-blue hover:text-tn-purple">
          ← All runs
        </Link>
      </div>
    )
  }

  const suites = groupBySuite(run.tests)

  return (
    <div>
      <Link
        to="/"
        className="mb-4 inline-block text-sm text-tn-blue hover:text-tn-purple"
      >
        ← All runs
      </Link>
      <RunHeader run={run} />
      <RunStats tests={run.tests} />
      {run.tests.length === 0 ? (
        <p className="py-8 text-center text-tn-muted">
          No test results uploaded yet.
        </p>
      ) : (
        <div className="space-y-3">
          {[...suites.entries()].map(([suite, tests]) => (
            <SuiteGroup
              key={suite}
              runId={run.runId}
              suite={suite}
              tests={tests}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function groupBySuite(tests: TestRecord[]): Map<string, TestRecord[]> {
  const map = new Map<string, TestRecord[]>()
  for (const test of tests) {
    const suite = test.titlePath[0] ?? 'Uncategorized'
    if (!map.has(suite)) map.set(suite, [])
    map.get(suite)!.push(test)
  }
  return map
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-24 rounded bg-tn-highlight" />
      <div className="h-16 rounded-lg bg-tn-highlight" />
      <div className="h-6 w-48 rounded bg-tn-highlight" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 rounded-lg bg-tn-highlight" />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Verify in browser**

Click a run row from the runs list. You should see:
- Back link → returns to `/`
- Project name + status badge + branch + commit + date
- Passed/failed counts
- Tests grouped by `titlePath[0]`, collapsible (click header to toggle)
- Each test row shows status icon, title, duration and links to test detail

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/RunDetailPage.tsx packages/web/src/components/RunHeader.tsx packages/web/src/components/RunStats.tsx packages/web/src/components/SuiteGroup.tsx
git commit -m "feat(web): implement RunDetailPage with suite grouping and collapsible rows"
```

---

## Task 8: Web — TestDetailPage

**Files:**
- Modify: `packages/web/src/pages/TestDetailPage.tsx`
- Create: `packages/web/src/components/TestHeader.tsx`
- Create: `packages/web/src/components/ErrorBlock.tsx`
- Create: `packages/web/src/components/AttachmentList.tsx`

- [ ] **Step 1: Create `packages/web/src/components/TestHeader.tsx`**

```typescript
import type { TestRecord } from '../lib/api.js'
import { formatDuration } from '../lib/format.js'
import StatusBadge from './StatusBadge.js'

interface Props {
  test: TestRecord
}

export default function TestHeader({ test }: Props) {
  const suitePath = test.titlePath.slice(0, -1).join(' › ')

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-start gap-3">
        <div className="flex-1">
          {suitePath && (
            <div className="mb-1 text-xs text-tn-muted">{suitePath}</div>
          )}
          <h1 className="text-xl font-bold text-tn-fg">{test.title}</h1>
        </div>
        <StatusBadge status={test.status} />
      </div>
      <div className="flex gap-4 text-sm text-tn-muted">
        <span>Duration: {formatDuration(test.duration)}</span>
        {test.retry > 0 && (
          <span className="text-tn-yellow">Retry #{test.retry}</span>
        )}
        <span>
          {test.location.file}:{test.location.line}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `packages/web/src/components/ErrorBlock.tsx`**

```typescript
interface Props {
  error: { message: string; stack?: string }
}

export default function ErrorBlock({ error }: Props) {
  return (
    <div className="rounded-lg border border-tn-red/30 bg-tn-red/10 p-4">
      <p className="mb-2 text-sm font-medium text-tn-red">{error.message}</p>
      {error.stack && (
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-tn-muted">
          {error.stack}
        </pre>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `packages/web/src/components/AttachmentList.tsx`**

```typescript
import type { TestRecord } from '../lib/api.js'

interface Props {
  runId: string
  testId: string
  attachments: TestRecord['attachments']
}

export default function AttachmentList({ runId, testId, attachments }: Props) {
  const items = attachments.filter((a) => a.filename)

  if (items.length === 0) return null

  return (
    <div>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-tn-muted">
        Attachments
      </h3>
      <div className="flex flex-wrap gap-2">
        {items.map((att, i) => {
          const url = `/reports/${runId}/attachments/${testId}/${att.filename!}`
          const isTrace =
            att.name === 'trace' || att.filename!.endsWith('.zip')

          if (isTrace) {
            const traceUrl = `https://trace.playwright.dev/?trace=${encodeURIComponent(
              window.location.origin + url,
            )}`
            return (
              <a
                key={i}
                href={traceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded border border-tn-blue px-3 py-1.5 text-sm text-tn-blue transition-colors hover:bg-tn-blue/10"
              >
                🔍 Open Trace ↗
              </a>
            )
          }

          return (
            <a
              key={i}
              href={url}
              download={att.filename}
              className="inline-flex items-center gap-1.5 rounded border border-tn-border px-3 py-1.5 text-sm text-tn-fg transition-colors hover:bg-tn-highlight"
            >
              {attachmentIcon(att.contentType)} {att.name}
            </a>
          )
        })}
      </div>
    </div>
  )
}

function attachmentIcon(contentType: string): string {
  if (contentType.startsWith('image/')) return '📸'
  if (contentType.startsWith('video/')) return '🎬'
  if (contentType === 'application/zip') return '🗜'
  return '📎'
}
```

- [ ] **Step 4: Replace `packages/web/src/pages/TestDetailPage.tsx`**

```typescript
import { Link, useParams } from 'react-router-dom'
import AttachmentList from '../components/AttachmentList.js'
import ErrorBlock from '../components/ErrorBlock.js'
import TestHeader from '../components/TestHeader.js'
import { useTest } from '../hooks/useTest.js'

export default function TestDetailPage() {
  const { runId, testId } = useParams<{ runId: string; testId: string }>()
  const { data: test, isLoading, error } = useTest(runId!, testId!)

  if (isLoading) return <Skeleton />

  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-tn-muted">
          {error.name === 'NotFoundError' ? 'Test not found.' : error.message}
        </p>
        <Link
          to={`/runs/${runId}`}
          className="text-tn-blue hover:text-tn-purple"
        >
          ← Back to run
        </Link>
      </div>
    )
  }

  return (
    <div>
      <Link
        to={`/runs/${runId}`}
        className="mb-4 inline-block text-sm text-tn-blue hover:text-tn-purple"
      >
        ← Back to run
      </Link>
      <TestHeader test={test} />
      {test.errors.length > 0 && (
        <div className="mb-6 space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-tn-muted">
            Errors
          </h3>
          {test.errors.map((err, i) => (
            <ErrorBlock key={i} error={err} />
          ))}
        </div>
      )}
      {test.annotations.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-tn-muted">
            Annotations
          </h3>
          <div className="space-y-1">
            {test.annotations.map((ann, i) => (
              <div key={i} className="text-sm text-tn-fg">
                <span className="text-tn-blue">[{ann.type}]</span>
                {ann.description && (
                  <span className="ml-2 text-tn-muted">{ann.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <AttachmentList
        runId={runId!}
        testId={testId!}
        attachments={test.attachments}
      />
    </div>
  )
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-32 rounded bg-tn-highlight" />
      <div className="h-20 rounded-lg bg-tn-highlight" />
      <div className="h-32 rounded-lg bg-tn-highlight" />
    </div>
  )
}
```

- [ ] **Step 5: Verify in browser**

Click a test row from the run detail page. You should see:
- Back link → returns to run detail
- Suite breadcrumb (if nested) + test title + status badge
- Duration, retry count (if > 0), file location
- Error block(s) with message and stack (only for failed/timedOut tests)
- Annotation list (if any)
- Attachment links — images/videos as download, `.zip` as "Open Trace ↗" to `trace.playwright.dev`

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/pages/TestDetailPage.tsx packages/web/src/components/TestHeader.tsx packages/web/src/components/ErrorBlock.tsx packages/web/src/components/AttachmentList.tsx
git commit -m "feat(web): implement TestDetailPage with errors, annotations, and attachments"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Run all server tests**

```bash
pnpm --filter @playwright-cart/server test
```

Expected: All tests pass (including the new `GET /:runId/tests/:testId` tests from Task 1).

- [ ] **Step 2: Run all web tests**

```bash
pnpm --filter @playwright-cart/web test
```

Expected: All tests pass (theme tests + api tests).

- [ ] **Step 3: Type-check all packages**

```bash
pnpm typecheck
```

Expected: No TypeScript errors.

- [ ] **Step 4: Start the full stack and walk through all routes**

```bash
pnpm dev
```

Open `http://localhost:5173` and verify:

1. **Runs list** — Stats bar shows total runs, pass rate, failed count. Filter by status `failed` → URL becomes `?status=failed` → table filters correctly. Clear filter → all runs return.
2. **Run detail** — Click a run row → navigates to `/runs/:runId`. Suite groups are collapsible. If run has `reportUrl` → "Open Report ↗" button appears.
3. **Test detail** — Click a test row → navigates to `/runs/:runId/tests/:testId`. Failed tests show error block with stack. If trace attachment exists → "Open Trace ↗" button appears.
4. **Theme toggle** — Click the theme button in the nav: System → Dark → Light → System. Reload the page — the theme persists.
5. **Live polling** — Start a new run via the reporter. While it shows `running`, the run detail page auto-refreshes every 5 seconds.

- [ ] **Step 5: Verify attachment URL format**

If you have a test run with attachments, confirm the attachment URL `/reports/{runId}/attachments/{testId}/{filename}` is reachable. Open DevTools → Network, click an attachment link, verify it returns 200.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(web): complete frontend dashboard — runs list, run detail, test detail"
```
