import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlaywrightCartReporter } from './index.js'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('PlaywrightCartReporter', () => {
  it('uploads normalized run tags on run creation', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ runId: 'run-1' }), { status: 201 }),
    )
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }))

    const reporter = new PlaywrightCartReporter({
      serverUrl: 'http://localhost:3001',
      project: 'demo',
      tags: [' @slow ', '@smoke', '@slow'],
    })

    reporter.onBegin({ reporter: [] } as never, {} as never)
    await reporter.onEnd({ status: 'passed' } as never)

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/api/runs',
      expect.objectContaining({ method: 'POST' }),
    )
    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(String(init?.body)) as {
      project: string
      tags: string[]
      startedAt: string
    }
    expect(body.project).toBe('demo')
    expect(body.tags).toEqual(['@slow', '@smoke'])
    expect(body.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('uploads effective test tags with test results', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ runId: 'run-1' }), { status: 201 }),
    )
    fetchMock.mockResolvedValueOnce(new Response('', { status: 201 }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }))

    const reporter = new PlaywrightCartReporter({
      serverUrl: 'http://localhost:3001',
      project: 'demo',
    })

    reporter.onBegin({ reporter: [] } as never, {} as never)
    reporter.onTestEnd(
      {
        title: 'my test',
        titlePath: () => ['suite', 'my test'],
        location: { file: 'a.spec.ts', line: 1, column: 1 },
        annotations: [],
        tags: ['@smoke', ' @auth ', '@smoke'],
      } as never,
      {
        retry: 0,
        status: 'passed',
        duration: 100,
        errors: [],
        attachments: [],
      } as never,
    )
    await reporter.onEnd({ status: 'passed' } as never)

    const request = fetchMock.mock.calls[1]
    expect(request[0]).toBe('http://localhost:3001/api/runs/run-1/tests')
    const formData = request[1]?.body as FormData
    const metadata = JSON.parse(String(formData.get('metadata'))) as { tags: string[] }
    expect(metadata.tags).toEqual(['@auth', '@smoke'])
  })
})
