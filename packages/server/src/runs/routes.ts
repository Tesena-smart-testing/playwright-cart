import { writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import AdmZip from 'adm-zip'
import { and, eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  generateRunSummaries,
  markRunSummaryGenerating,
  markTestSummaryGenerating,
} from '../ai/summarizer.js'
import { adminMiddleware } from '../auth/middleware.js'
import type { HonoEnv } from '../auth/types.js'
import { db } from '../db/client.js'
import { aiSummaries, appSettings, runs as runsSchema } from '../db/schema.js'
import { type RunEvent, runEmitter } from '../events.js'
import { applyOutcomeInversion } from './outcome.js'
import * as storage from './storage.js'

export const runs = new Hono<HonoEnv>()

const SAFE_ID = /^[a-z0-9_\-.]+$/i

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags || tags.length === 0) return []

  return [...new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0))].sort()
}

runs.post('/', async (c) => {
  const body = await c.req.json<{
    project: string
    branch?: string
    commitSha?: string
    tags?: string[]
    startedAt: string
  }>()
  const slug = body.project.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  const runId = `${slug}-${Date.now()}`
  const run: storage.RunRecord = {
    runId,
    project: body.project,
    branch: body.branch,
    commitSha: body.commitSha,
    tags: normalizeTags(body.tags),
    startedAt: body.startedAt,
    status: 'running',
  }
  await storage.createRun(run)
  runEmitter.emit('event', { type: 'run:created', runId } satisfies RunEvent)
  return c.json({ runId }, 201)
})

runs.get('/', async (c) => {
  const page = Math.max(1, Number(c.req.query('page') ?? '1'))
  const rawPageSize = Number(c.req.query('pageSize') ?? '10')
  const pageSize = ([10, 25, 50, 100] as const).includes(rawPageSize as 10 | 25 | 50 | 100)
    ? (rawPageSize as 10 | 25 | 50 | 100)
    : 10
  const project = c.req.query('project') || undefined
  const branch = c.req.query('branch') || undefined
  const status = c.req.query('status') || undefined
  const tags = normalizeTags(c.req.queries('tag'))
  const result = await storage.listRuns({ page, pageSize, project, branch, status, tags })
  return c.json({ ...result, page, pageSize })
})

runs.get('/meta', async (c) => {
  const projectRows = await db.selectDistinct({ project: runsSchema.project }).from(runsSchema)
  const branchRows = await db.selectDistinct({ branch: runsSchema.branch }).from(runsSchema)
  const tagRows = await db.execute<{ tag: string }>(sql`
    SELECT DISTINCT unnest(${runsSchema.tags}) AS tag
    FROM ${runsSchema}
    WHERE cardinality(${runsSchema.tags}) > 0
    ORDER BY tag ASC
  `)
  return c.json({
    projects: projectRows.map((r) => r.project).sort(),
    branches: branchRows
      .filter((r): r is { branch: string } => r.branch != null)
      .map((r) => r.branch)
      .sort(),
    tags: tagRows.rows.map((row) => row.tag),
  })
})

runs.get('/stats/timeline', async (c) => {
  const intervalRaw = c.req.query('interval') ?? 'day'
  const interval = (['run', 'day', 'week'] as const).includes(intervalRaw as 'run' | 'day' | 'week')
    ? (intervalRaw as 'run' | 'day' | 'week')
    : 'day'
  const daysRaw = Number(c.req.query('days') ?? '30')
  const days = Number.isNaN(daysRaw) ? 30 : Math.min(365, Math.max(1, daysRaw))
  const limitRaw = c.req.query('limit')
  const limitNum = limitRaw !== undefined ? Number(limitRaw) : undefined
  const limit =
    limitNum !== undefined && !Number.isNaN(limitNum)
      ? Math.min(200, Math.max(1, limitNum))
      : undefined
  const project = c.req.query('project') || undefined
  const branch = c.req.query('branch') || undefined
  const tags = normalizeTags(c.req.queries('tag'))
  const buckets = await storage.getRunTimeline({ interval, days, limit, project, branch, tags })
  return c.json({ buckets })
})

runs.get('/:runId', async (c) => {
  const runId = c.req.param('runId')
  const run = await storage.getRun(runId)
  if (!run) return c.json({ error: 'Not found' }, 404)
  const tests = await storage.getTestResults(runId)
  return c.json({ ...run, tests: tests.map(applyOutcomeInversion) })
})

runs.get('/:runId/tests/:testId', async (c) => {
  const { runId, testId } = c.req.param()
  const run = await storage.getRun(runId)
  if (!run) return c.json({ error: 'Not found' }, 404)
  const test = await storage.getTestResult(runId, testId)
  if (!test) return c.json({ error: 'Not found' }, 404)
  return c.json(applyOutcomeInversion(test))
})

runs.post('/:runId/complete', async (c) => {
  const runId = c.req.param('runId')
  const { completedAt, status } = await c.req.json<{
    completedAt: string
    status: storage.RunRecord['status']
  }>()
  await storage.updateRun(runId, { completedAt, status })
  runEmitter.emit('event', { type: 'run:updated', runId } satisfies RunEvent)

  if (status === 'failed' || status === 'interrupted' || status === 'timedOut') {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, 'llm_enabled'))
    if (row?.value === 'true') {
      generateRunSummaries(runId).catch((err) => console.error('[ai] summary error:', err))
    }
  }

  return c.json({})
})

runs.post('/:runId/tests', async (c) => {
  const runId = c.req.param('runId')
  if (!SAFE_ID.test(runId)) return c.json({ error: 'Invalid runId' }, 400)
  const body = await c.req.parseBody()
  const metadata = JSON.parse(body.metadata as string) as storage.TestRecord & { tags?: string[] }
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

  await storage.writeTestResult(runId, { ...metadata, tags: normalizeTags(metadata.tags) })
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

runs.get('/:runId/summary', async (c) => {
  const runId = c.req.param('runId')
  const [row] = await db
    .select()
    .from(aiSummaries)
    .where(
      and(
        eq(aiSummaries.entityType, 'run'),
        eq(aiSummaries.runId, runId),
        eq(aiSummaries.entityId, runId),
      ),
    )
    .limit(1)
  if (!row) return c.json(null)
  return c.json({
    status: row.status,
    content: row.content,
    errorMsg: row.errorMsg,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    model: row.model,
    provider: row.provider,
  })
})

runs.get('/:runId/tests/:testId/summary', async (c) => {
  const { runId, testId } = c.req.param()
  const [row] = await db
    .select()
    .from(aiSummaries)
    .where(
      and(
        eq(aiSummaries.entityType, 'test'),
        eq(aiSummaries.runId, runId),
        eq(aiSummaries.entityId, testId),
      ),
    )
    .limit(1)
  if (!row) return c.json(null)
  return c.json({
    status: row.status,
    content: row.content,
    errorMsg: row.errorMsg,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    model: row.model,
    provider: row.provider,
  })
})

runs.post('/:runId/summary/regenerate', async (c) => {
  const runId = c.req.param('runId')
  const run = await storage.getRun(runId)
  if (!run) return c.json({ error: 'Not found' }, 404)
  const [existing] = await db
    .select({ status: aiSummaries.status })
    .from(aiSummaries)
    .where(
      and(
        eq(aiSummaries.entityType, 'run'),
        eq(aiSummaries.entityId, runId),
        eq(aiSummaries.runId, runId),
      ),
    )
    .limit(1)
  if (existing?.status === 'generating') return c.json({ error: 'already_generating' }, 409)
  const marked = await markRunSummaryGenerating(runId)
  if (!marked) return c.json({ error: 'llm_not_configured' }, 422)
  generateRunSummaries(runId).catch((err) => console.error('[ai] regen error:', err))
  return c.json({ ok: true }, 202)
})

runs.post('/:runId/tests/:testId/summary/regenerate', async (c) => {
  const { runId, testId } = c.req.param()
  const run = await storage.getRun(runId)
  if (!run) return c.json({ error: 'Not found' }, 404)
  const [existing] = await db
    .select({ status: aiSummaries.status })
    .from(aiSummaries)
    .where(
      and(
        eq(aiSummaries.entityType, 'test'),
        eq(aiSummaries.entityId, testId),
        eq(aiSummaries.runId, runId),
      ),
    )
    .limit(1)
  if (existing?.status === 'generating') return c.json({ error: 'already_generating' }, 409)
  const marked = await markTestSummaryGenerating(runId, testId)
  if (!marked) return c.json({ error: 'llm_not_configured' }, 422)
  generateRunSummaries(runId).catch((err) => console.error('[ai] regen error:', err))
  return c.json({ ok: true }, 202)
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
