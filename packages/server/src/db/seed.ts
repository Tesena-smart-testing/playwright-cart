import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { db } from './client.js'
import { appSettings, users } from './schema.js'

export async function runSeed(): Promise<void> {
  // Bootstrap admin user if none exist and env vars are set
  const existingUsers = await db.select().from(users).limit(1)
  if (existingUsers.length === 0) {
    const username = process.env.ADMIN_USERNAME
    const password = process.env.ADMIN_PASSWORD
    if (username && password) {
      const passwordHash = await bcrypt.hash(password, 12)
      await db.insert(users).values({ username, passwordHash, role: 'admin' })
      console.log('[seed] created admin user')
    } else {
      console.log('[seed] no users exist but ADMIN_USERNAME/ADMIN_PASSWORD not set — skipping admin bootstrap')
    }
  }

  // Seed default data_retention_days if not present
  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, 'data_retention_days'))
  if (existing.length === 0) {
    await db.insert(appSettings).values({ key: 'data_retention_days', value: '90' })
    console.log('[seed] seeded app_settings: data_retention_days=90')
  }
}
