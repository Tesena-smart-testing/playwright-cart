import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import * as storage from './storage.js'

export const runs = new Hono()

runs.post('/', async (c) => {
  const body = await c.req.json<{
    project: string
    branch?: string
    commitSha?: string
    startedAt: string
  }>()
  const slug = body.project.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const runId = `${slug}-${Date.now()}`
  const run: storage.RunRecord = {
    runId,
    project: body.project,
    branch: body.branch,
    commitSha: body.commitSha,
    startedAt: body.startedAt,
    status: 'running',
  }
  storage.createRun(run)
  return c.json({ runId }, 201)
})

runs.get('/', (c) => {
  return c.json(storage.listRuns())
})

runs.get('/:runId', (c) => {
  const run = storage.getRun(c.req.param('runId'))
  if (!run) return c.json({ error: 'Not found' }, 404)
  const tests = storage.getTestResults(c.req.param('runId'))
  return c.json({ ...run, tests })
})

runs.post('/:runId/complete', async (c) => {
  const { completedAt, status } = await c.req.json<{
    completedAt: string
    status: storage.RunRecord['status']
  }>()
  storage.updateRun(c.req.param('runId'), { completedAt, status })
  return c.json({})
})

runs.post('/:runId/tests', async (c) => {
  const body = await c.req.parseBody()
  const metadata = JSON.parse(body['metadata'] as string) as storage.TestRecord
  const attachmentsDir = storage.getAttachmentsDir(c.req.param('runId'), metadata.testId)

  for (let i = 0; ; i++) {
    const file = body[`attachment_${i}`]
    if (!file) break
    if (file instanceof File) {
      const buf = Buffer.from(await file.arrayBuffer())
      writeFileSync(join(attachmentsDir, file.name), buf)
    }
  }

  storage.writeTestResult(c.req.param('runId'), metadata)
  return c.json({ testId: metadata.testId }, 201)
})
