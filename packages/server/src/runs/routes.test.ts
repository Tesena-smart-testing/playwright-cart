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
  storage.storageConfig.dataDir = testDir
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
