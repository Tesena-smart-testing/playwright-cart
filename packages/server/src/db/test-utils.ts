import { sql } from 'drizzle-orm'
import { db } from './client.js'

/**
 * Truncate all application tables in dependency order.
 * Call in beforeEach to get a clean slate between tests.
 */
export async function resetDb(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE test_errors, test_annotations, test_attachments, tests, runs RESTART IDENTITY CASCADE`,
  )
}
