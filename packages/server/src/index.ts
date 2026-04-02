import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors())

// List all uploaded reports
app.get('/api/reports', async (c) => {
  // TODO: scan ./data/ for .metadata.json sidecar files and return sorted list
  // Each entry: { id, reportUrl, branch, commitSha, runId, uploadedAt, status }
  return c.json([])
})

// Upload a new report (multipart: report zip + JSON metadata fields)
app.post('/api/reports', async (c) => {
  // TODO:
  // 1. Parse multipart body: report (zip), branch, commitSha, runId, project
  // 2. Generate reportId = `${project}/${runId}-${Date.now()}`
  // 3. Extract zip to ./data/${reportId}/
  // 4. Write .metadata.json sidecar
  // 5. Return { id, reportUrl: `/reports/${reportId}/index.html` }
  return c.json({ reportUrl: '' }, 201)
})

// Serve extracted report files.
// The Service-Worker-Allowed and Accept-Ranges headers are required for
// Playwright's trace viewer to work correctly in-browser.
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
app.use('/reports/*', serveStatic({ root: './data' }))

const port = Number(process.env.PORT ?? 3001)

serve({ fetch: app.fetch, port }, () => {
  console.log(`[playwright-cart/server] listening on http://localhost:${port}`)
})
