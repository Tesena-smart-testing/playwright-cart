import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { adminMiddleware } from '../auth/middleware.js'
import type { HonoEnv } from '../auth/types.js'
import { hashPassword, verifyPassword } from '../auth/utils.js'
import { db } from '../db/client.js'
import { users } from '../db/schema.js'

// Keep in sync with ChartId in packages/web/src/lib/charts.ts
const VALID_CHART_IDS = new Set([
  'pass-rate',
  'failures',
  'flaky',
  'duration',
  'total-tests',
  'test-reliability',
])

export const usersRouter = new Hono<HonoEnv>()

// ── Admin-only routes ──────────────────────────────────────────────────────────

usersRouter.get('/', adminMiddleware, async (c) => {
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
  return c.json(rows)
})

usersRouter.post('/', adminMiddleware, async (c) => {
  const body = await c.req.json<{ username?: unknown; password?: unknown; role?: unknown }>()

  if (typeof body.username !== 'string' || typeof body.password !== 'string') {
    return c.json({ error: 'username and password are required strings' }, 400)
  }
  if (body.username.trim().length === 0) {
    return c.json({ error: 'Username cannot be empty' }, 400)
  }
  if (body.password.trim().length === 0) {
    return c.json({ error: 'Password cannot be empty' }, 400)
  }
  if (body.password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }
  if (body.password.length > 64) {
    return c.json({ error: 'Password too long' }, 400)
  }
  if (body.role !== 'admin' && body.role !== 'user') {
    return c.json({ error: 'role must be "admin" or "user"' }, 400)
  }

  let inserted: { id: number; username: string; role: 'admin' | 'user' } | undefined
  try {
    ;[inserted] = await db
      .insert(users)
      .values({
        username: body.username,
        passwordHash: await hashPassword(body.password),
        role: body.role,
      })
      .returning({ id: users.id, username: users.username, role: users.role })
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return c.json({ error: 'Username already taken' }, 409)
    }
    throw err
  }

  return c.json(inserted, 201)
})

// ── Own-account route (any authenticated user) — must be before /:userId ──────

usersRouter.patch('/me', async (c) => {
  const authUser = c.get('authUser')
  if (authUser.type !== 'user') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json<{
    username?: unknown
    password?: unknown
    currentPassword?: unknown
    theme?: unknown
    runsPerPage?: unknown
    chartOrder?: unknown
  }>()

  const updateData: Partial<{
    username: string
    passwordHash: string
    theme: 'dark' | 'light' | 'system'
    runsPerPage: number
    chartOrder: string[] | null
  }> = {}

  // Password change: currentPassword required and verified
  if (body.password !== undefined) {
    if (typeof body.password !== 'string') {
      return c.json({ error: 'password must be a string' }, 400)
    }
    if (body.password.trim().length === 0) {
      return c.json({ error: 'Password cannot be empty' }, 400)
    }
    if (body.password.length < 8) {
      return c.json({ error: 'Password must be at least 8 characters' }, 400)
    }
    if (body.password.length > 64) {
      return c.json({ error: 'Password too long' }, 400)
    }
    if (typeof body.currentPassword !== 'string') {
      return c.json({ error: 'currentPassword is required when changing password' }, 400)
    }

    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, authUser.id))
      .limit(1)

    if (!row) {
      return c.json({ error: 'User not found' }, 404)
    }

    const valid = await verifyPassword(body.currentPassword, row.passwordHash)
    if (!valid) {
      return c.json({ error: 'Current password is incorrect' }, 401)
    }

    updateData.passwordHash = await hashPassword(body.password)
  }

  // Username change
  if (body.username !== undefined) {
    if (typeof body.username !== 'string') {
      return c.json({ error: 'username must be a string' }, 400)
    }
    if (body.username.trim().length === 0) {
      return c.json({ error: 'Username cannot be empty' }, 400)
    }
    updateData.username = body.username
  }

  // Theme change
  if (body.theme !== undefined) {
    if (body.theme !== 'dark' && body.theme !== 'light' && body.theme !== 'system') {
      return c.json({ error: 'theme must be "dark", "light", or "system"' }, 400)
    }
    updateData.theme = body.theme
  }

  if (body.runsPerPage !== undefined) {
    if (![10, 25, 50, 100].includes(body.runsPerPage as number)) {
      return c.json({ error: 'runsPerPage must be 10, 25, 50, or 100' }, 400)
    }
    updateData.runsPerPage = body.runsPerPage as number
  }

  if (body.chartOrder !== undefined) {
    if (body.chartOrder === null) {
      updateData.chartOrder = null
    } else if (
      !Array.isArray(body.chartOrder) ||
      body.chartOrder.length !== 6 ||
      !body.chartOrder.every((id) => typeof id === 'string' && VALID_CHART_IDS.has(id)) ||
      new Set(body.chartOrder).size !== 6
    ) {
      return c.json({ error: 'chartOrder must be an array of all 6 valid chart IDs' }, 400)
    } else {
      updateData.chartOrder = body.chartOrder as string[]
    }
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: 'No valid fields to update' }, 400)
  }

  let updated:
    | {
        id: number
        username: string
        role: 'admin' | 'user'
        theme: 'dark' | 'light' | 'system'
        runsPerPage: number
        chartOrder: string[] | null
      }
    | undefined
  try {
    ;[updated] = await db.update(users).set(updateData).where(eq(users.id, authUser.id)).returning({
      id: users.id,
      username: users.username,
      role: users.role,
      theme: users.theme,
      runsPerPage: users.runsPerPage,
      chartOrder: users.chartOrder,
    })
  } catch (err: unknown) {
    // Unique constraint violation on username
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return c.json({ error: 'Username already taken' }, 409)
    }
    throw err
  }

  if (!updated) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json(updated)
})

usersRouter.patch('/:userId', adminMiddleware, async (c) => {
  const userId = Number(c.req.param('userId'))
  if (!Number.isFinite(userId)) {
    return c.json({ error: 'Invalid userId' }, 400)
  }

  const authUser = c.get('authUser')
  if (authUser.type === 'user' && authUser.id === userId) {
    return c.json({ error: 'Cannot modify your own account via admin API' }, 403)
  }

  const body = await c.req.json<{ role?: unknown }>()
  if (body.role !== 'admin' && body.role !== 'user') {
    return c.json({ error: 'role must be "admin" or "user"' }, 400)
  }

  const [updated] = await db
    .update(users)
    .set({ role: body.role })
    .where(eq(users.id, userId))
    .returning({ id: users.id, username: users.username, role: users.role })

  if (!updated) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json(updated)
})

usersRouter.delete('/:userId', adminMiddleware, async (c) => {
  const userId = Number(c.req.param('userId'))
  if (!Number.isFinite(userId)) {
    return c.json({ error: 'Invalid userId' }, 400)
  }

  const authUser = c.get('authUser')
  if (authUser.type === 'user' && authUser.id === userId) {
    return c.json({ error: 'Cannot modify your own account via admin API' }, 403)
  }

  const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id })
  if (deleted.length === 0) {
    return c.json({ error: 'User not found' }, 404)
  }

  return c.json({ ok: true })
})
