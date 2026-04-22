import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { app } from './app.js'
import { hashPassword, signToken } from './auth/utils.js'
import { db } from './db/client.js'
import { users } from './db/schema.js'
import { startTestDatabase, stopTestDatabase } from './db/test-utils.js'
import { runEmitter } from './events.js'

let authCookie: string
let container: StartedPostgreSqlContainer

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-for-app-tests'
  container = await startTestDatabase()
  const [user] = await db
    .insert(users)
    .values({
      username: 'app-test-user',
      passwordHash: await hashPassword('test-pass'),
      role: 'user',
    })
    .onConflictDoUpdate({ target: users.username, set: { role: 'user' } })
    .returning()
  const token = await signToken({ userId: user.id })
  authCookie = `auth_token=${token}`
})

afterEach(() => {
  runEmitter.removeAllListeners()
})

afterAll(async () => {
  await stopTestDatabase(container)
})

async function readNextChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value)
    if (text) return text
  }
  return ''
}

describe('GET /api/events', () => {
  it('responds with 200 and text/event-stream content type', async () => {
    const res = await app.request('/api/events', { headers: { Cookie: authCookie } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/event-stream')
    await res.body?.cancel()
  })

  it('streams a run:created event to the client', async () => {
    const res = await app.request('/api/events', { headers: { Cookie: authCookie } })
    if (!res.body) throw new Error('Response has no body')
    const reader = res.body.getReader()

    const textPromise = readNextChunk(reader)

    setTimeout(() => {
      runEmitter.emit('event', { type: 'run:created', runId: 'run-42' })
    }, 10)

    const text = await textPromise

    expect(text).toContain('event: run:created')
    expect(text).toContain('"runId":"run-42"')

    await reader.cancel()
  })

  it('streams a run:updated event to the client', async () => {
    const res = await app.request('/api/events', { headers: { Cookie: authCookie } })
    if (!res.body) throw new Error('Response has no body')
    const reader = res.body.getReader()

    const textPromise = readNextChunk(reader)

    setTimeout(() => {
      runEmitter.emit('event', { type: 'run:updated', runId: 'run-99' })
    }, 10)

    const text = await textPromise

    expect(text).toContain('event: run:updated')
    expect(text).toContain('"runId":"run-99"')

    await reader.cancel()
  })
})

describe('POST /api/auth/login', () => {
  it('returns JSON rate-limit response without internal details', async () => {
    const attempts = Array.from({ length: 101 }, () =>
      app.request('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-real-ip': 'rate-limit-test-ip',
        },
        body: JSON.stringify({ username: 'missing-user', password: 'wrong-pass' }),
      }),
    )

    const responses = await Promise.all(attempts)
    const limited = responses.at(-1)
    if (!limited) throw new Error('Missing rate-limited response')

    expect(limited.status).toBe(429)
    expect(limited.headers.get('content-type')).toContain('application/json')
    await expect(limited.json()).resolves.toEqual({
      error: 'Too many login attempts. Please try again later.',
    })
  })
})
