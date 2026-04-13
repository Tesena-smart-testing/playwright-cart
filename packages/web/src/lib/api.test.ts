import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRun, fetchRuns, fetchTest, NotFoundError } from './api.js'

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
      page: 1,
      pageSize: 10,
    }
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(mockPage), { status: 200 }))

    const result = await fetchRuns({ page: 1, pageSize: 10 })

    expect(fetch).toHaveBeenCalledWith('/api/runs?page=1&pageSize=10')
    expect(result).toEqual(mockPage)
  })

  it('includes filter params in the query string when provided', async () => {
    const mockPage = { runs: [], total: 0, totalPassed: 0, totalFailed: 0, page: 1, pageSize: 25 }
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
