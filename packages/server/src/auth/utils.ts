import { createHmac, randomBytes } from 'node:crypto'
import * as bcrypt from 'bcrypt'
import { sign, verify } from 'hono/jwt'

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET environment variable is not set')
  return secret
}

export async function signToken(payload: { userId: number }): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 8 * 60 * 60
  return sign({ ...payload, exp }, getJwtSecret())
}

export async function verifyToken(token: string): Promise<{ userId: number; exp: number } | null> {
  try {
    const payload = (await verify(token, getJwtSecret(), 'HS256')) as Record<string, unknown>
    const userId = payload.userId
    const exp = payload.exp
    if (typeof userId !== 'number') return null
    if (typeof exp !== 'number') return null
    return { userId, exp }
  } catch {
    return null
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateApiKey(): string {
  return randomBytes(32).toString('hex')
}

export function hashApiKey(key: string, secret: string): string {
  return createHmac('sha256', secret).update(key).digest('hex')
}
