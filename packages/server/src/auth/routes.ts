import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import { db } from '../db/client.js'
import { revokedTokens, users } from '../db/schema.js'
import type { HonoEnv } from './types.js'
import { signToken, verifyPassword } from './utils.js'

export const authRouter = new Hono<HonoEnv>()

authRouter.post('/login', async (c) => {
  const body = await c.req.json<{ username?: unknown; password?: unknown }>()
  if (typeof body.username !== 'string' || typeof body.password !== 'string') {
    return c.json({ error: 'Invalid request' }, 400)
  }
  const { username, password } = body

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1)
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = await signToken({ userId: user.id })

  setCookie(c, 'auth_token', token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60,
  })

  return c.json({ ok: true })
})

authRouter.post('/logout', async (c) => {
  const authUser = c.get('authUser')
  if (authUser?.type === 'user') {
    await db
      .insert(revokedTokens)
      .values({ jti: authUser.jti, exp: new Date(authUser.exp * 1000) })
      .onConflictDoNothing()
  }
  deleteCookie(c, 'auth_token', { path: '/' })
  return c.json({ ok: true })
})

authRouter.get('/me', (c) => {
  const authUser = c.get('authUser')
  if (authUser.type === 'apikey') {
    return c.json({ error: 'Forbidden' }, 403)
  }
  return c.json({
    id: authUser.id,
    username: authUser.username,
    role: authUser.role,
    theme: authUser.theme,
    runsPerPage: authUser.runsPerPage,
    chartOrder: authUser.chartOrder,
    expiresAt: authUser.exp,
  })
})
