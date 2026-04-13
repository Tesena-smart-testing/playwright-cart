import { describe, expect, it, vi } from 'vitest'
import { buildTestId, normalizeTags, Semaphore, uploadWithRetry } from './upload.js'

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

describe('normalizeTags', () => {
  it('returns empty array for missing tags', () => {
    expect(normalizeTags(undefined)).toEqual([])
  })

  it('trims, deduplicates, and sorts tags', () => {
    expect(normalizeTags([' @slow ', '@smoke', '@slow', ''])).toEqual(['@slow', '@smoke'])
  })
})

describe('uploadWithRetry', () => {
  it('calls fn once on success', async () => {
    const fn = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
    await uploadWithRetry(fn, 3, 1)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on non-2xx response until success', async () => {
    const fn = vi
      .fn()
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
    const fn = vi
      .fn()
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
