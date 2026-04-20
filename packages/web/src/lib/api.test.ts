import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestStatus } from './api.js'
import {
  fetchRun,
  fetchRuns,
  fetchTest,
  getTestOutcome,
  login,
  NotFoundError,
  regenerateRunSummary,
  regenerateTestSummary,
} from './api.js'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchRuns', () => {
  it('fetches /api/runs with pagination params and returns RunsPage', async () => {
    const mockPage = {
      runs: [
        {
          runId: 'run-1',
          project: 'my-app',
          tags: ['@smoke'],
          startedAt: '2026-04-02T10:00:00.000Z',
          status: 'passed',
        },
      ],
      total: 1,
      totalPassed: 1,
      totalFailed: 0,
      totalCompleted: 1,
      page: 1,
      pageSize: 10,
    }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockPage), { status: 200 }))

    const result = await fetchRuns({ page: 1, pageSize: 10 })

    expect(fetch).toHaveBeenCalledWith('/api/runs?page=1&pageSize=10')
    expect(result).toEqual(mockPage)
  })

  it('includes filter params in the query string when provided', async () => {
    const mockPage = {
      runs: [],
      total: 0,
      totalPassed: 0,
      totalFailed: 0,
      totalCompleted: 0,
      page: 1,
      pageSize: 25,
    }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockPage), { status: 200 }))

    await fetchRuns({
      page: 1,
      pageSize: 25,
      project: 'my-app',
      status: 'failed',
      tags: ['@auth', '@smoke'],
    })

    expect(fetch).toHaveBeenCalledWith(
      '/api/runs?page=1&pageSize=25&project=my-app&status=failed&tag=%40auth&tag=%40smoke',
    )
  })

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 500 }))
    await expect(fetchRuns({ page: 1, pageSize: 10 })).rejects.toThrow('HTTP 500')
  })
})

describe('login', () => {
  it('resolves on successful login', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    await expect(login('demo', 'secret')).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'demo', password: 'secret' }),
    })
  })

  it('uses JSON error message for invalid credentials', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await expect(login('demo', 'wrong')).rejects.toThrow('Invalid credentials')
  })

  it('falls back to friendly message for non-JSON rate-limit responses', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Too many requests, please try again later.', {
        status: 429,
        headers: { 'Content-Type': 'text/plain' },
      }),
    )

    await expect(login('demo', 'secret')).rejects.toThrow(
      'Too many requests. Please try again later.',
    )
  })
})

describe('fetchRun', () => {
  it('fetches /api/runs/:runId and returns run with tests', async () => {
    const mockRun = {
      runId: 'run-1',
      project: 'p',
      tags: [],
      startedAt: '2026-04-02T10:00:00.000Z',
      status: 'passed',
      tests: [],
    }
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
    const mockTest = { testId: 'test-1', title: 'my test', tags: [] }
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

describe('getTestOutcome', () => {
  const makeTest = (status: string, annotationTypes: string[] = []) => ({
    status: status as TestStatus,
    annotations: annotationTypes.map((type) => ({ type })),
  })

  it('returns normal for test without fail annotation', () => {
    expect(getTestOutcome(makeTest('passed'))).toBe('normal')
    expect(getTestOutcome(makeTest('failed'))).toBe('normal')
  })

  it('returns expected-failure for status=passed with fail annotation (server pre-inverted expected failure)', () => {
    // Server inverts: test.fail() that failed in Playwright → API ships status='passed'
    expect(getTestOutcome(makeTest('passed', ['fail']))).toBe('expected-failure')
  })

  it('returns unexpected-pass for status=failed with fail annotation (server pre-inverted unexpected pass)', () => {
    // Server inverts: test.fail() that passed in Playwright → API ships status='failed'
    expect(getTestOutcome(makeTest('failed', ['fail']))).toBe('unexpected-pass')
  })

  it('returns normal for non-fail annotation types', () => {
    expect(getTestOutcome(makeTest('passed', ['slow']))).toBe('normal')
    expect(getTestOutcome(makeTest('failed', ['issue']))).toBe('normal')
  })
})

describe('regenerateRunSummary', () => {
  it('resolves on 202', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }))
    await expect(regenerateRunSummary('run-1')).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/runs/run-1/summary/regenerate', { method: 'POST' })
  })

  it('throws Error("HTTP 409") on 409 so component can detect already-generating', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'already_generating' }), { status: 409 }),
    )
    await expect(regenerateRunSummary('run-1')).rejects.toThrow('HTTP 409')
  })

  it('throws Error("HTTP 422") on 422', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'llm_not_configured' }), { status: 422 }),
    )
    await expect(regenerateRunSummary('run-1')).rejects.toThrow('HTTP 422')
  })
})

describe('regenerateTestSummary', () => {
  it('resolves on 202', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }))
    await expect(regenerateTestSummary('run-1', 'test-1')).resolves.toBeUndefined()
    expect(fetch).toHaveBeenCalledWith('/api/runs/run-1/tests/test-1/summary/regenerate', {
      method: 'POST',
    })
  })

  it('throws Error("HTTP 409") on 409 so component can detect already-generating', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'already_generating' }), { status: 409 }),
    )
    await expect(regenerateTestSummary('run-1', 'test-1')).rejects.toThrow('HTTP 409')
  })
})
