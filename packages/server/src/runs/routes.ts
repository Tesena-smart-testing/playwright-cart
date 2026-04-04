import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { Hono } from 'hono'
import { type RunEvent, runEmitter } from '../events.js'
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
  const body = await c.req.parseBody()
  const metadata = JSON.parse(body.metadata as string) as storage.TestRecord
  const attachmentsDir = storage.getAttachmentsDir(runId, metadata.testId)

  for (let i = 0; ; i++) {
    const file = body[`attachment_${i}`]
    if (!file) break
    if (file instanceof File) {
      const buf = Buffer.from(await file.arrayBuffer())
      writeFileSync(join(attachmentsDir, file.name), buf)
    }
  }

  await storage.writeTestResult(runId, metadata)
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)
  return c.json({ testId: metadata.testId }, 201)
})

runs.post('/:runId/report', async (c) => {
  const runId = c.req.param('runId')
  const body = await c.req.parseBody()
  const reportFile = body.report as File
  const completedAt = body.completedAt as string
  const status = body.status as storage.RunRecord['status']

  const zipBuf = Buffer.from(await reportFile.arrayBuffer())
  const zip = new AdmZip(zipBuf)
  zip.extractAllTo(storage.getReportDir(runId), true)

  const reportUrl = `/reports/${runId}/report/index.html`
  await storage.updateRun(runId, { completedAt, status, reportUrl })
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)

  return c.json({ reportUrl })
})
