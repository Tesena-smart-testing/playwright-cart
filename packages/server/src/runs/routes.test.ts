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
      body: JSON.stringify({ project: 'my-app', tags: [], startedAt: '2026-04-02T10:00:00.000Z' }),
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
        tags: ['@release', '@smoke'],
        startedAt: '2026-04-02T10:00:00.000Z',
        branch: 'main',
        commitSha: 'abc123',
      }),
    })
    const { runId } = (await res.json()) as { runId: string }
    const run = await storage.getRun(runId)
    expect(run?.branch).toBe('main')
    expect(run?.commitSha).toBe('abc123')
    expect(run?.tags).toEqual(['@release', '@smoke'])
  })

  it('emits run:created with the new runId', async () => {
    const spy = vi.spyOn(runEmitter, 'emit')
    await runs.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'my-app', tags: [], startedAt: '2026-04-04T10:00:00.000Z' }),
    })
    expect(spy).toHaveBeenCalledWith('event', expect.objectContaining({ type: 'run:created' }))
    spy.mockRestore()
  })
})

describe('GET /api/runs', () => {
  it('returns empty result when no runs exist', async () => {
    const res = await runs.request('/')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      runs: storage.RunRecord[]
      total: number
      totalPassed: number
      totalFailed: number
      totalCompleted: number
      page: number
      pageSize: number
    }
    expect(body.runs).toEqual([])
    expect(body.total).toBe(0)
    expect(body.totalCompleted).toBe(0)
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(10)
  })

  it('returns existing runs', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const res = await runs.request('/')
    const body = (await res.json()) as {
      runs: storage.RunRecord[]
      total: number
      totalCompleted: number
    }
    expect(body.runs).toHaveLength(1)
    expect(body.runs[0].runId).toBe('run-1')
    expect(body.total).toBe(1)
    expect(body.totalCompleted).toBe(0)
  })

  it('returns totalCompleted excluding running runs', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'passed',
    })
    await storage.createRun({
      runId: 'run-2',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T11:00:00.000Z',
      status: 'running',
    })

    const res = await runs.request('/')
    const body = (await res.json()) as {
      total: number
      totalPassed: number
      totalCompleted: number
    }

    expect(body.total).toBe(2)
    expect(body.totalPassed).toBe(1)
    expect(body.totalCompleted).toBe(1)
  })

  it('filters runs by repeated tag params with AND semantics', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      tags: ['@auth', '@smoke'],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'passed',
    })
    await storage.createRun({
      runId: 'run-2',
      project: 'p',
      tags: ['@auth'],
      startedAt: '2026-04-02T11:00:00.000Z',
      status: 'passed',
    })

    const res = await runs.request('/?tag=%40auth&tag=%40smoke')
    const body = (await res.json()) as { runs: storage.RunRecord[]; total: number }
    expect(body.runs).toHaveLength(1)
    expect(body.runs[0].runId).toBe('run-1')
    expect(body.total).toBe(1)
  })

  it('filters runs by a single tag param', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      tags: ['@demo', '@smoke'],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'passed',
    })
    await storage.createRun({
      runId: 'run-2',
      project: 'p',
      tags: ['@auth'],
      startedAt: '2026-04-02T11:00:00.000Z',
      status: 'passed',
    })

    const res = await runs.request('/?tag=%40demo')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { runs: storage.RunRecord[]; total: number }
    expect(body.runs).toHaveLength(1)
    expect(body.runs[0].runId).toBe('run-1')
    expect(body.total).toBe(1)
  })
})

describe('GET /api/runs/meta', () => {
  it('returns empty arrays when no runs exist', async () => {
    const res = await runs.request('/meta')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { projects: string[]; branches: string[] }
    expect(body.projects).toEqual([])
    expect(body.branches).toEqual([])
  })

  it('returns distinct sorted project names', async () => {
    await storage.createRun({
      runId: 'r1',
      project: 'beta',
      tags: ['@slow'],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'passed',
    })
    await storage.createRun({
      runId: 'r2',
      project: 'alpha',
      tags: ['@smoke'],
      startedAt: '2026-04-02T11:00:00.000Z',
      status: 'passed',
    })
    await storage.createRun({
      runId: 'r3',
      project: 'alpha',
      tags: [],
      startedAt: '2026-04-02T12:00:00.000Z',
      status: 'failed',
    })
    const res = await runs.request('/meta')
    const body = (await res.json()) as { projects: string[]; branches: string[] }
    expect(body.projects).toEqual(['alpha', 'beta'])
  })

  it('returns distinct sorted branch names, excluding null branches', async () => {
    await storage.createRun({
      runId: 'r1',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'passed',
      branch: 'main',
    })
    await storage.createRun({
      runId: 'r2',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T11:00:00.000Z',
      status: 'passed',
      branch: 'feature/foo',
    })
    await storage.createRun({
      runId: 'r3',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T12:00:00.000Z',
      status: 'passed',
    }) // no branch
    await storage.createRun({
      runId: 'r4',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T13:00:00.000Z',
      status: 'passed',
      branch: 'main',
    }) // duplicate
    const res = await runs.request('/meta')
    const body = (await res.json()) as { projects: string[]; branches: string[] }
    expect(body.branches).toEqual(['feature/foo', 'main'])
  })

  it('returns distinct sorted tags', async () => {
    await storage.createRun({
      runId: 'r1',
      project: 'p',
      tags: ['@slow', '@smoke'],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'passed',
    })
    await storage.createRun({
      runId: 'r2',
      project: 'p',
      tags: ['@auth', '@smoke'],
      startedAt: '2026-04-02T11:00:00.000Z',
      status: 'passed',
    })

    const res = await runs.request('/meta')
    const body = (await res.json()) as { projects: string[]; branches: string[]; tags: string[] }
    expect(body.tags).toEqual(['@auth', '@slow', '@smoke'])
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
      tags: [],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    await storage.writeTestResult('run-1', {
      testId: 'my-test',
      title: 'my test',
      tags: ['@auth'],
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
    expect(body.tests[0].tags).toEqual(['@auth'])
  })
})

describe('POST /api/runs/:runId/tests', () => {
  it('saves test metadata and returns 201', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const metadata: storage.TestRecord = {
      testId: 'suite--my-test',
      title: 'my test',
      tags: ['@auth', '@smoke'],
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
    const results = await storage.getTestResults('run-1')
    expect(results).toHaveLength(1)
    expect(results[0].testId).toBe('suite--my-test')
    expect(results[0].tags).toEqual(['@auth', '@smoke'])
  })

  it('saves attachment files to disk', async () => {
    await storage.createRun({
      runId: 'run-1',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const metadata: storage.TestRecord = {
      testId: 'test-with-attach',
      title: 'test',
      tags: [],
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
      tags: [],
      startedAt: '2026-04-04T10:00:00.000Z',
      status: 'running',
    })
    const spy = vi.spyOn(runEmitter, 'emit')
    const metadata: storage.TestRecord = {
      testId: 'suite--my-test',
      title: 'my test',
      tags: [],
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
      tags: [],
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
      tags: [],
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
      tags: [],
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
      tags: [],
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

describe('GET /api/runs/stats/timeline', () => {
  async function seedRun(
    project: string,
    branch: string,
    startedAt: string,
    status: 'passed' | 'failed',
  ) {
    const res = await runs.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, branch, tags: [], startedAt }),
    })
    const { runId } = (await res.json()) as { runId: string }
    await storage.updateRun(runId, { completedAt: startedAt, status })
    return runId
  }

  it('returns daily buckets with aggregated stats', async () => {
    const runId = await seedRun('proj', 'main', '2026-04-10T10:00:00.000Z', 'passed')
    await storage.writeTestResult(runId, {
      testId: 't1',
      title: 'test 1',
      tags: [],
      titlePath: ['suite'],
      location: { file: 'a.spec.ts', line: 1, column: 0 },
      status: 'passed',
      duration: 1000,
      retry: 0,
      errors: [],
      annotations: [],
      attachments: [],
    })
    await storage.writeTestResult(runId, {
      testId: 't2',
      title: 'test 2',
      tags: [],
      titlePath: ['suite'],
      location: { file: 'a.spec.ts', line: 2, column: 0 },
      status: 'failed',
      duration: 2000,
      retry: 0,
      errors: [],
      annotations: [],
      attachments: [],
    })

    const res = await runs.request('/stats/timeline?interval=day&days=30')
    expect(res.status).toBe(200)
    const { buckets } = (await res.json()) as { buckets: storage.TimelineBucket[] }
    expect(buckets).toHaveLength(1)
    expect(buckets[0].total).toBe(2)
    expect(buckets[0].passed).toBe(1)
    expect(buckets[0].failed).toBe(1)
    expect(buckets[0].flaky).toBe(0)
    expect(buckets[0].runCount).toBe(1)
    expect(buckets[0].avgDurationMs).toBe(1500)
  })

  it('filters by project', async () => {
    await seedRun('proj-a', 'main', '2026-04-10T10:00:00.000Z', 'passed')
    await seedRun('proj-b', 'main', '2026-04-10T10:00:00.000Z', 'passed')
    const res = await runs.request('/stats/timeline?interval=day&days=30&project=proj-a')
    const { buckets } = (await res.json()) as { buckets: storage.TimelineBucket[] }
    expect(buckets).toHaveLength(1)
  })

  it('returns per-run buckets when interval=run', async () => {
    await seedRun('proj', 'main', '2026-04-10T10:00:00.000Z', 'passed')
    await seedRun('proj', 'main', '2026-04-11T10:00:00.000Z', 'passed')
    const res = await runs.request('/stats/timeline?interval=run&limit=10')
    const { buckets } = (await res.json()) as { buckets: storage.TimelineBucket[] }
    expect(buckets).toHaveLength(2)
    expect(buckets[0].runCount).toBe(1)
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
      tags: [],
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
      tags: [],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'running',
    })
    const test: storage.TestRecord = {
      testId: 'my-test',
      title: 'my test',
      tags: ['@smoke'],
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
    expect(body.tags).toEqual(['@smoke'])
  })
})
