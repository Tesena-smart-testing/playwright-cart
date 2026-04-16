import { eq } from 'drizzle-orm'
import type { MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { db } from '../db/client.js'
import { apiKeys, revokedTokens, users } from '../db/schema.js'
import type { HonoEnv } from './types.js'
import { getJwtSecret, hashApiKey, verifyToken } from './utils.js'

export const authMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const token = getCookie(c, 'auth_token')

  if (token) {
    const result = await verifyToken(token)
    if (result) {
      const [revoked] = await db
        .select()
        .from(revokedTokens)
        .where(eq(revokedTokens.jti, result.jti))
        .limit(1)
      if (!revoked) {
        const [user] = await db.select().from(users).where(eq(users.id, result.userId)).limit(1)
        if (user) {
          c.set('authUser', {
            type: 'user',
            id: user.id,
            username: user.username,
            role: user.role,
            theme: user.theme,
            runsPerPage: user.runsPerPage,
            chartOrder: user.chartOrder ?? null,
            exp: result.exp,
            jti: result.jti,
          })
          return next()
        }
      }
    }
  }

  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const key = authHeader.slice(7)
    const keyHash = hashApiKey(key, getJwtSecret())
    const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1)
    if (row) {
      c.set('authUser', { type: 'apikey', keyId: row.id })
      return next()
    }
  }

  return c.json({ error: 'Unauthorized' }, 401)
}

/** Must be applied after authMiddleware — assumes authUser is already set on context. */
export const adminMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const authUser = c.get('authUser')
  if (authUser.type !== 'user' || authUser.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403)
  }
  return next()
}
