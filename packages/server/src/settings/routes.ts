import { eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { encrypt } from '../ai/crypto.js'
import { listProviders } from '../ai/providers/index.js'
import { adminMiddleware } from '../auth/middleware.js'
import type { HonoEnv } from '../auth/types.js'
import { db } from '../db/client.js'
import { appSettings } from '../db/schema.js'

export const settingsRouter = new Hono<HonoEnv>()

settingsRouter.get('/', async (c) => {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, 'data_retention_days'))
    .limit(1)

  const data_retention_days = row ? Number.parseInt(row.value, 10) : 90
  return c.json({ data_retention_days })
})

settingsRouter.patch('/', adminMiddleware, async (c) => {
  const body = await c.req.json<{ data_retention_days?: unknown }>()

  const days = body.data_retention_days
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 180) {
    return c.json({ error: 'data_retention_days must be an integer between 1 and 180' }, 400)
  }

  await db
    .insert(appSettings)
    .values({ key: 'data_retention_days', value: String(days) })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: String(days) } })

  return c.json({ data_retention_days: days })
})

settingsRouter.get('/llm', async (c) => {
  const rows = await db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, ['llm_enabled', 'llm_provider', 'llm_model', 'llm_api_key']))
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return c.json({
    enabled: map.llm_enabled === 'true',
    provider: map.llm_provider ?? 'anthropic',
    model: map.llm_model ?? 'claude-sonnet-4-6',
    isConfigured: !!map.llm_api_key,
    providers: listProviders(),
  })
})

settingsRouter.patch('/llm', adminMiddleware, async (c) => {
  const body = await c.req.json<{
    enabled?: boolean
    provider?: string
    model?: string
    apiKey?: string
  }>()

  const jwtSecret = process.env.JWT_SECRET ?? ''
  const updates: { key: string; value: string }[] = []

  if (typeof body.enabled === 'boolean') {
    updates.push({ key: 'llm_enabled', value: String(body.enabled) })
  }
  if (typeof body.provider === 'string') {
    updates.push({ key: 'llm_provider', value: body.provider })
  }
  if (typeof body.model === 'string') {
    updates.push({ key: 'llm_model', value: body.model })
  }
  if (typeof body.apiKey === 'string' && body.apiKey.length > 0) {
    updates.push({ key: 'llm_api_key', value: encrypt(body.apiKey, jwtSecret) })
  }

  if (updates.length === 0) return c.json({ error: 'No fields to update' }, 400)

  const enabledUpdate = updates.find((u) => u.key === 'llm_enabled')
  if (enabledUpdate?.value === 'true') {
    const hasKeyUpdate = updates.some((u) => u.key === 'llm_api_key')
    if (!hasKeyUpdate) {
      const [existing] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, 'llm_api_key'))
      if (!existing) return c.json({ error: 'Cannot enable without an API key configured' }, 400)
    }
  }

  for (const { key, value } of updates) {
    await db
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSettings.key, set: { value } })
  }

  return c.json({ ok: true })
})
