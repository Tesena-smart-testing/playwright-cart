import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { runs } from './runs/routes.js'

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors())

app.route('/api/runs', runs)

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
app.use('/reports/*', serveStatic({ root: process.env.DATA_DIR ?? './data' }))

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[playwright-cart/server] listening on http://localhost:${port}`)
})
