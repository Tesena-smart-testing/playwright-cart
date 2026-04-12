import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { app } from './app.js'
import { signToken, hashPassword } from './auth/utils.js'
import { closeDb } from './db/client.js'
import { db } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { users } from './db/schema.js'
import { runEmitter } from './events.js'

let authCookie: string

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-for-app-tests'
  await runMigrations()
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
  await closeDb()
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
