import { randomBytes } from 'node:crypto'
import { serveStatic } from '@hono/node-server/serve-static'
import { and, eq, gt, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { streamSSE } from 'hono/streaming'
import { rateLimiter } from 'hono-rate-limiter'
import { apiKeysRouter } from './api-keys/routes.js'
import { authMiddleware } from './auth/middleware.js'
import { authRouter } from './auth/routes.js'
import type { HonoEnv } from './auth/types.js'
import { getJwtSecret, hashApiKey } from './auth/utils.js'
import { db } from './db/client.js'
import { reportTokens } from './db/schema.js'
import { type RunEvent, runEmitter } from './events.js'
import { runs } from './runs/routes.js'
import { settingsRouter } from './settings/routes.js'
import { usersRouter } from './users/routes.js'

export const app = new Hono<HonoEnv>()

const PUBLIC_PATHS = new Set(['/api/auth/login', '/api/health'])

app.use('*', logger())
app.use(
  '/api/*',
  cors({
    origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  }),
)
app.get('/api/health', (c) => c.json({ ok: true }))
app.use(
  '/api/auth/login',
  rateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (c) => c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown',
  }),
)
app.use('/api/*', async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next()
  return authMiddleware(c, next)
})
app.route('/api/auth', authRouter)

app.get('/api/events', (c) =>
  streamSSE(c, (stream) => {
    const send = (event: RunEvent) => {
      stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
    }
    runEmitter.on('event', send)

    const heartbeat = setInterval(() => {
      stream.write(': keepalive\n\n')
    }, 15000)

    return new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(heartbeat)
        runEmitter.off('event', send)
        resolve()
      })
    })
  }),
)

app.route('/api/runs', runs)
app.route('/api/users', usersRouter)
app.route('/api/settings', settingsRouter)
app.route('/api/api-keys', apiKeysRouter)

app.use(
  '/reports/*',
  cors({
    origin: [process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173', 'https://trace.playwright.dev'],
  }),
)
app.use('/reports/*', async (c, next) => {
  const token = c.req.query('token')
  if (token) {
    const hash = hashApiKey(token, getJwtSecret())
    const [row] = await db
      .select()
      .from(reportTokens)
      .where(
        and(
          eq(reportTokens.tokenHash, hash),
          eq(reportTokens.filePath, c.req.path),
          gt(reportTokens.expiresAt, new Date()),
        ),
      )
      .limit(1)
    if (!row) return c.json({ error: 'Invalid or expired token' }, 401)
    await db.delete(reportTokens).where(eq(reportTokens.id, row.id))
    return next()
  }
  return authMiddleware(c, next)
})
app.post('/api/report-token', authMiddleware, async (c) => {
  const body = await c.req.json<{ path?: unknown }>()
  const path = body.path
  if (typeof path !== 'string' || !path.startsWith('/reports/') || path.includes('..')) {
    return c.json({ error: 'Invalid path' }, 400)
  }
  await db.delete(reportTokens).where(lt(reportTokens.expiresAt, new Date()))
  const raw = randomBytes(32).toString('hex')
  const tokenHash = hashApiKey(raw, getJwtSecret())
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  await db.insert(reportTokens).values({ tokenHash, filePath: path, expiresAt })
  return c.json({ token: raw })
})
app.use('/reports/*', async (c, next) => {
  await next()
  c.header('Service-Worker-Allowed', '/')
  c.header('Accept-Ranges', 'bytes')
  if (c.req.path.endsWith('.html')) {
    c.header('Cache-Control', 'no-cache')
  } else {
    c.header('Cache-Control', 'private, max-age=604800')
  }
})
app.use(
  '/reports/*',
  serveStatic({
    root: process.env.DATA_DIR ?? './data',
    rewriteRequestPath: (path) => path.replace(/^\/reports/, ''),
  }),
)
