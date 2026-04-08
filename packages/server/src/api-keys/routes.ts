import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { adminMiddleware } from '../auth/middleware.js'
import type { HonoEnv } from '../auth/types.js'
import { generateApiKey, getJwtSecret, hashApiKey } from '../auth/utils.js'
import { db } from '../db/client.js'
import { apiKeys } from '../db/schema.js'

export const apiKeysRouter = new Hono<HonoEnv>()

apiKeysRouter.get('/', adminMiddleware, async (c) => {
  const rows = await db
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)

  const result = rows.map((row) => ({
    ...row,
    maskedKey: '••••••••',
  }))

  return c.json(result)
})

apiKeysRouter.post('/', adminMiddleware, async (c) => {
  const authUser = c.get('authUser')
  // adminMiddleware already ensures type === 'user' && role === 'admin'
  if (authUser.type !== 'user') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json<{ label?: unknown }>()

  if (typeof body.label !== 'string' || body.label.trim().length === 0) {
    return c.json({ error: 'label must be a non-empty string' }, 400)
  }

  const rawKey = generateApiKey()
  const keyHash = hashApiKey(rawKey, getJwtSecret())

  const [inserted] = await db
    .insert(apiKeys)
    .values({
      keyHash,
      label: body.label,
      createdBy: authUser.id,
    })
    .returning({
      id: apiKeys.id,
      label: apiKeys.label,
      createdAt: apiKeys.createdAt,
    })

  return c.json({ ...inserted, key: rawKey }, 201)
})

apiKeysRouter.delete('/:id', adminMiddleware, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  const deleted = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning({ id: apiKeys.id })

  if (deleted.length === 0) {
    return c.json({ error: 'API key not found' }, 404)
  }

  return c.json({ ok: true })
})
