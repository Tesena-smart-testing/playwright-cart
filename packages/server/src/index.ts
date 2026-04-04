import { serve } from '@hono/node-server'
import { app } from './app.js'
import { runMigrations } from './db/migrate.js'
import { runSeed } from './db/seed.js'

const port = Number(process.env.PORT ?? 3001)

await runMigrations()
await runSeed()

serve({ fetch: app.fetch, port }, () => {
  console.log(`[playwright-cart/server] listening on http://localhost:${port}`)
})
