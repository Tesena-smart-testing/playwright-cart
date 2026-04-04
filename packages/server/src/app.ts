import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { streamSSE } from 'hono/streaming'
import { authMiddleware } from './auth/middleware.js'
import { authRouter } from './auth/routes.js'
import type { HonoEnv } from './auth/types.js'
import { type RunEvent, runEmitter } from './events.js'
import { runs } from './runs/routes.js'

export const app = new Hono<HonoEnv>()

const PUBLIC_PATHS = new Set(['/api/auth/login'])

app.use('*', logger())
app.use('/api/*', cors())
app.route('/api/auth', authRouter)
app.use('/api/*', async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path)) return next()
  return authMiddleware(c, next)
})

app.get('/api/events', (c) =>
  streamSSE(c, (stream) => {
    const send = (event: RunEvent) => {
      stream.writeSSE({ event: event.type, data: JSON.stringify(event) })
    }
    runEmitter.on('event', send)
    return new Promise<void>((resolve) => {
      stream.onAbort(() => {
        runEmitter.off('event', send)
        resolve()
      })
    })
  }),
)

app.route('/api/runs', runs)

app.use('/reports/*', cors())
app.use('/reports/*', async (c, next) => {
  await next()
  c.header('Service-Worker-Allowed', '/')
  c.header('Accept-Ranges', 'bytes')
  if (c.req.path.endsWith('.html')) {
    c.header('Cache-Control', 'no-cache')
  } else {
    c.header('Cache-Control', 'public, max-age=604800')
  }
})
app.use(
  '/reports/*',
  serveStatic({
    root: process.env.DATA_DIR ?? './data',
    rewriteRequestPath: (path) => path.replace(/^\/reports/, ''),
  }),
)
