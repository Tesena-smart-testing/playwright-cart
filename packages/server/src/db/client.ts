import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

type DbInstance = {
  pool: Pool
  db: ReturnType<typeof drizzle<typeof schema>>
}

let instance: DbInstance | null = null

function getInstance(): DbInstance {
  if (instance) return instance
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL environment variable is not set')
  const pool = new Pool({ connectionString: url })
  instance = { pool, db: drizzle(pool, { schema }) }
  return instance
}

// Proxy defers pool creation until first access so DATABASE_URL can be set after module load (e.g. testcontainers)
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    const realDb = getInstance().db
    const value = Reflect.get(realDb, prop)
    if (typeof value === 'function') {
      return value.bind(realDb)
    }
    return value
  },
})

export async function closeDb(): Promise<void> {
  if (instance) {
    await instance.pool.end()
    instance = null
  }
}
