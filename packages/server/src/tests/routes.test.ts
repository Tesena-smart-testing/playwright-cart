import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, startTestDatabase, stopTestDatabase } from '../db/test-utils.js'
import * as runsStorage from '../runs/storage.js'
import { testsRouter } from './routes.js'

let container: StartedPostgreSqlContainer

beforeAll(async () => {
  container = await startTestDatabase()
})
beforeEach(async () => {
  await resetDb()
})
afterAll(async () => {
  await stopTestDatabase(container)
})

async function seedTestInRun(
  runId: string,
  testId: string,
  title: string,
  opts: { status?: 'passed' | 'failed'; retry?: number; durationMs?: number } = {},
) {
  await runsStorage.writeTestResult(runId, {
    testId,
    title,
    tags: [],
    titlePath: ['suite'],
    location: { file: 'a.spec.ts', line: 1, column: 0 },
    status: opts.status ?? 'passed',
    duration: opts.durationMs ?? 500,
    retry: opts.retry ?? 0,
    errors: [],
    annotations: [],
    attachments: [],
  })
}

describe('GET /api/tests/search', () => {
  it('returns matching tests by title', async () => {
    const runId = `r-${Date.now()}`
    await runsStorage.createRun({
      runId,
      project: 'p',
      tags: [],
      startedAt: new Date().toISOString(),
      status: 'passed',
    })
    await seedTestInRun(runId, 't1', 'login flow works')
    await seedTestInRun(runId, 't2', 'checkout completes')

    const res = await testsRouter.request('/search?q=login')
    expect(res.status).toBe(200)
    const { tests } = (await res.json()) as { tests: { testId: string; title: string }[] }
    expect(tests).toHaveLength(1)
    expect(tests[0].title).toBe('login flow works')
  })

  it('returns 400 when q is too short', async () => {
    const res = await testsRouter.request('/search?q=a')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/tests/:testId/history', () => {
  it('returns history for a test across runs', async () => {
    const runId1 = `r1-${Date.now()}`
    const runId2 = `r2-${Date.now()}`
    await runsStorage.createRun({
      runId: runId1,
      project: 'p',
      tags: [],
      startedAt: '2026-04-10T10:00:00Z',
      status: 'passed',
    })
    await runsStorage.createRun({
      runId: runId2,
      project: 'p',
      tags: [],
      startedAt: '2026-04-11T10:00:00Z',
      status: 'failed',
    })
    await seedTestInRun(runId1, 'stable-test', 'stable test', { status: 'passed' })
    await seedTestInRun(runId2, 'stable-test', 'stable test', { status: 'failed' })

    const res = await testsRouter.request('/stable-test/history')
    expect(res.status).toBe(200)
    const { history } = (await res.json()) as { history: { runId: string; status: string }[] }
    expect(history).toHaveLength(2)
    expect(history.map((h) => h.status)).toContain('passed')
    expect(history.map((h) => h.status)).toContain('failed')
  })
})
