import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { sql } from 'drizzle-orm'
import { closeDb, db } from './client.js'
import { runMigrations } from './migrate.js'

export async function startTestDatabase(): Promise<StartedPostgreSqlContainer> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start()
  process.env.DATABASE_URL = container.getConnectionUri()
  await runMigrations()
  return container
}

export async function stopTestDatabase(container: StartedPostgreSqlContainer): Promise<void> {
  try {
    await closeDb()
  } finally {
    await container.stop()
  }
}

export async function resetDb(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE runs RESTART IDENTITY CASCADE`)
}
