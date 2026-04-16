import { Hono } from 'hono'
import type { HonoEnv } from '../auth/types.js'
import * as storage from './storage.js'

export const testsRouter = new Hono<HonoEnv>()

testsRouter.get('/search', async (c) => {
  const q = c.req.query('q') ?? ''
  if (q.length < 2) return c.json({ error: 'q must be at least 2 characters' }, 400)
  const project = c.req.query('project') || undefined
  const tests = await storage.searchTests(q, project)
  return c.json({ tests })
})

testsRouter.get('/:testId/history', async (c) => {
  const testId = decodeURIComponent(c.req.param('testId'))
  const limitRaw = Number(c.req.query('limit') ?? '50')
  const limit = Number.isNaN(limitRaw) ? 50 : Math.min(200, Math.max(1, limitRaw))
  const branch = c.req.query('branch') || undefined
  const result = await storage.getTestHistory(testId, limit, branch)
  if (!result.test) return c.json({ error: 'Not found' }, 404)
  return c.json(result)
})
