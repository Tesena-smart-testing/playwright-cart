import { eq, lt } from 'drizzle-orm'
import { db } from './db/client.js'
import { appSettings, runs } from './db/schema.js'
import { deleteRuns } from './runs/storage.js'

const INTERVAL_MS = 1000 * 60 * 60 // 1 hour
const DEFAULT_RETENTION_DAYS = 90

async function getRetentionDays(): Promise<number> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, 'data_retention_days'))
  if (!row) return DEFAULT_RETENTION_DAYS
  const parsed = Number.parseInt(row.value, 10)
  return Number.isNaN(parsed) ? DEFAULT_RETENTION_DAYS : parsed
}

export function startRetentionJob(): void {
  setInterval(async () => {
    try {
      const retentionDays = await getRetentionDays()
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

      const staleRuns = await db
        .select({ runId: runs.runId })
        .from(runs)
        .where(lt(runs.startedAt, cutoff))

      if (staleRuns.length === 0) return

      const runIds = staleRuns.map((r) => r.runId)
      const deleted = await deleteRuns(runIds)
      if (deleted > 0) {
        console.log(`[retention] deleted ${deleted} run(s) older than ${retentionDays} days`)
      }
    } catch (err) {
      console.error('[retention] error during retention job:', err)
    }
  }, INTERVAL_MS)
}
