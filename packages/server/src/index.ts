import { serve } from '@hono/node-server'
import { eq } from 'drizzle-orm'
import { app } from './app.js'
import { db } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import { runSeed } from './db/seed.js'
import { aiSummaries } from './db/schema.js'
import { startRetentionJob } from './retention.js'

const port = Number(process.env.PORT ?? 3001)

await runMigrations()
await runSeed()

await db
  .update(aiSummaries)
  .set({ status: 'error', errorMsg: 'Server restarted during generation — please regenerate' })
  .where(eq(aiSummaries.status, 'generating'))

startRetentionJob()

serve({ fetch: app.fetch, port }, () => {
  console.log(`[playwright-cart/server] listening on http://localhost:${port}`)
})
