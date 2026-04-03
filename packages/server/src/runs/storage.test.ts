import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as storage from './storage.js'

let testDir: string

beforeEach(() => {
  testDir = join(tmpdir(), `pct-test-${Date.now()}`)
  mkdirSync(testDir, { recursive: true })
  storage.storageConfig.dataDir = testDir
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
