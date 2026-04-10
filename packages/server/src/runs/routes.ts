import { writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import AdmZip from 'adm-zip'
import { Hono } from 'hono'
import { adminMiddleware } from '../auth/middleware.js'
import type { HonoEnv } from '../auth/types.js'
import { type RunEvent, runEmitter } from '../events.js'
import * as storage from './storage.js'

export const runs = new Hono<HonoEnv>()

const SAFE_ID = /^[a-z0-9_\-.]+$/i

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
  await storage.createRun(run)
  runEmitter.emit('event', { type: 'run:created', runId } satisfies RunEvent)
  return c.json({ runId }, 201)
})

runs.get('/', async (c) => {
  return c.json(await storage.listRuns())
})

runs.get('/:runId', async (c) => {
  const runId = c.req.param('runId')
  const run = await storage.getRun(runId)
  if (!run) return c.json({ error: 'Not found' }, 404)
  const tests = await storage.getTestResults(runId)
  return c.json({ ...run, tests })
})

runs.get('/:runId/tests/:testId', async (c) => {
  const { runId, testId } = c.req.param()
  const run = await storage.getRun(runId)
  if (!run) return c.json({ error: 'Not found' }, 404)
  const test = await storage.getTestResult(runId, testId)
  if (!test) return c.json({ error: 'Not found' }, 404)
  return c.json(test)
})

runs.post('/:runId/complete', async (c) => {
  const runId = c.req.param('runId')
  const { completedAt, status } = await c.req.json<{
    completedAt: string
    status: storage.RunRecord['status']
  }>()
  await storage.updateRun(runId, { completedAt, status })
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)
  return c.json({})
})

runs.post('/:runId/tests', async (c) => {
  const runId = c.req.param('runId')
  if (!SAFE_ID.test(runId)) return c.json({ error: 'Invalid runId' }, 400)
  const body = await c.req.parseBody()
  const metadata = JSON.parse(body.metadata as string) as storage.TestRecord
  if (!SAFE_ID.test(metadata.testId)) return c.json({ error: 'Invalid testId' }, 400)
  const attachmentsDir = storage.getAttachmentsDir(runId, metadata.testId)

  for (let i = 0; ; i++) {
    const file = body[`attachment_${i}`]
    if (!file) break
    if (file instanceof File) {
      const buf = Buffer.from(await file.arrayBuffer())
      writeFileSync(join(attachmentsDir, basename(file.name)), buf)
    }
  }

  await storage.writeTestResult(runId, metadata)
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)
  return c.json({ testId: metadata.testId }, 201)
})

runs.post('/:runId/report', async (c) => {
  const runId = c.req.param('runId')
  if (!SAFE_ID.test(runId)) return c.json({ error: 'Invalid runId' }, 400)
  const body = await c.req.parseBody()
  const reportFile = body.report as File
  const completedAt = body.completedAt as string
  const status = body.status as storage.RunRecord['status']

  const zipBuf = Buffer.from(await reportFile.arrayBuffer())
  const zip = new AdmZip(zipBuf)
  const reportDir = storage.getReportDir(runId)
  const resolvedBase = resolve(reportDir)
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const entryPath = resolve(reportDir, entry.entryName)
    if (!entryPath.startsWith(`${resolvedBase}/`)) {
      return c.json({ error: 'Invalid archive entry' }, 400)
    }
  }
  zip.extractAllTo(reportDir, true)

  const reportUrl = `/reports/${runId}/report/index.html`
  await storage.updateRun(runId, { completedAt, status, reportUrl })
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)

  return c.json({ reportUrl })
})

runs.delete('/:runId', adminMiddleware, async (c) => {
  const runId = c.req.param('runId')
  const deleted = await storage.deleteRun(runId)
  if (!deleted) return c.json({ error: 'Not found' }, 404)
  return c.json({ ok: true })
})

runs.post('/delete-batch', adminMiddleware, async (c) => {
  const body = await c.req.json<{ runIds?: unknown }>()
  const { runIds } = body
  if (
    !Array.isArray(runIds) ||
    runIds.length === 0 ||
    !runIds.every((id) => typeof id === 'string')
  ) {
    return c.json({ error: 'runIds must be a non-empty array of strings' }, 400)
  }
  const deleted = await storage.deleteRuns(runIds as string[])
  return c.json({ deleted })
})
