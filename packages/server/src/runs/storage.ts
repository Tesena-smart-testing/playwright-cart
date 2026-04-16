import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { SQL } from 'drizzle-orm'
import { and, arrayContains, count, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { runs, testAnnotations, testAttachments, testErrors, tests } from '../db/schema.js'

export const storageConfig = {
  dataDir: process.env.DATA_DIR ?? './data',
}

export interface RunRecord {
  runId: string
  project: string
  branch?: string
  commitSha?: string
  tags: string[]
  startedAt: string
  completedAt?: string
  status: 'running' | 'passed' | 'failed' | 'interrupted' | 'timedOut'
  reportUrl?: string
  flakyCount?: number
}

export interface TestRecord {
  testId: string
  title: string
  tags: string[]
  titlePath: string[]
  location: { file: string; line: number; column: number }
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
  duration: number
  errors: Array<{ message: string; stack?: string }>
  retry: number
  annotations: Array<{ type: string; description?: string }>
  attachments: Array<{ name: string; contentType: string; filename?: string }>
}

// ---------- helpers ----------

function toRunRecord(row: typeof runs.$inferSelect): RunRecord {
  return {
    runId: row.runId,
    project: row.project,
    ...(row.branch != null && { branch: row.branch }),
    ...(row.commitSha != null && { commitSha: row.commitSha }),
    tags: row.tags as string[],
    startedAt: row.startedAt.toISOString(),
    ...(row.completedAt != null && { completedAt: row.completedAt.toISOString() }),
    status: row.status,
    ...(row.reportUrl != null && { reportUrl: row.reportUrl }),
  }
}

function assembleTestRecord(
  row: typeof tests.$inferSelect,
  errors: (typeof testErrors.$inferSelect)[],
  annotations: (typeof testAnnotations.$inferSelect)[],
  attachments: (typeof testAttachments.$inferSelect)[],
): TestRecord {
  return {
    testId: row.testId,
    title: row.title,
    tags: row.tags as string[],
    titlePath: row.titlePath as string[],
    location: { file: row.locationFile, line: row.locationLine, column: row.locationCol },
    status: row.status,
    duration: row.durationMs,
    retry: row.retry,
    errors: errors
      .sort((a, b) => a.position - b.position)
      .map((e) => ({ message: e.message, ...(e.stack != null && { stack: e.stack }) })),
    annotations: annotations
      .sort((a, b) => a.position - b.position)
      .map((a) => ({ type: a.type, ...(a.description != null && { description: a.description }) })),
    attachments: attachments
      .sort((a, b) => a.position - b.position)
      .map((a) => ({
        name: a.name,
        contentType: a.contentType,
        ...(a.filename != null && { filename: a.filename }),
      })),
  }
}

// ---------- run operations ----------

export async function createRun(run: RunRecord): Promise<void> {
  await db.insert(runs).values({
    runId: run.runId,
    project: run.project,
    branch: run.branch,
    commitSha: run.commitSha,
    tags: run.tags,
    startedAt: new Date(run.startedAt),
    status: run.status,
  })
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  const [row] = await db.select().from(runs).where(eq(runs.runId, runId))
  return row ? toRunRecord(row) : null
}

export async function updateRun(runId: string, update: Partial<RunRecord>): Promise<void> {
  const values: Partial<typeof runs.$inferInsert> = {}
  if (update.status != null) values.status = update.status
  if (update.reportUrl != null) values.reportUrl = update.reportUrl
  if (update.completedAt != null) values.completedAt = new Date(update.completedAt)
  if (Object.keys(values).length === 0) return
  await db.update(runs).set(values).where(eq(runs.runId, runId))
}

export type RunsQuery = {
  page: number
  pageSize: number
  project?: string
  branch?: string
  status?: string
  tags?: string[]
}

export async function listRuns(query: RunsQuery): Promise<{
  runs: RunRecord[]
  total: number
  totalPassed: number
  totalFailed: number
  totalCompleted: number
}> {
  const conditions: SQL[] = []
  if (query.project) conditions.push(eq(runs.project, query.project))
  if (query.branch) conditions.push(eq(runs.branch, query.branch))
  if (query.status) conditions.push(eq(runs.status, query.status as RunRecord['status']))
  if (query.tags && query.tags.length > 0) conditions.push(arrayContains(runs.tags, query.tags))
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [agg] = await db
    .select({
      total: count(),
      totalPassed: sql<number>`COUNT(*) FILTER (WHERE ${runs.status} = 'passed')`,
      totalFailed: sql<number>`COUNT(*) FILTER (WHERE ${runs.status} = 'failed')`,
      totalCompleted: sql<number>`COUNT(*) FILTER (WHERE ${runs.status} <> 'running')`,
    })
    .from(runs)
    .where(whereClause)

  const rows = await db
    .select()
    .from(runs)
    .where(whereClause)
    .orderBy(desc(runs.startedAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)

  const runIds = rows.map((r) => r.runId)
  const flakyCounts =
    runIds.length > 0
      ? await db
          .select({ runId: tests.runId, flakyCount: count() })
          .from(tests)
          .where(and(inArray(tests.runId, runIds), gt(tests.retry, 0), eq(tests.status, 'passed')))
          .groupBy(tests.runId)
      : []
  const flakyMap = new Map(flakyCounts.map((r) => [r.runId, r.flakyCount]))

  return {
    runs: rows.map((row) => ({ ...toRunRecord(row), flakyCount: flakyMap.get(row.runId) ?? 0 })),
    total: Number(agg?.total ?? 0),
    totalPassed: Number(agg?.totalPassed ?? 0),
    totalFailed: Number(agg?.totalFailed ?? 0),
    totalCompleted: Number(agg?.totalCompleted ?? 0),
  }
}

// ---------- test operations ----------

export async function writeTestResult(runId: string, test: TestRecord): Promise<void> {
  await db.transaction(async (tx) => {
    const [{ id: testPk }] = await tx
      .insert(tests)
      .values({
        testId: test.testId,
        runId,
        title: test.title,
        tags: test.tags,
        titlePath: test.titlePath,
        locationFile: test.location.file,
        locationLine: test.location.line,
        locationCol: test.location.column,
        status: test.status,
        durationMs: test.duration,
        retry: test.retry,
      })
      .returning({ id: tests.id })

    if (test.errors.length > 0) {
      await tx.insert(testErrors).values(
        test.errors.map((e, i) => ({
          testPk,
          position: i,
          message: e.message,
          stack: e.stack,
        })),
      )
    }

    if (test.annotations.length > 0) {
      await tx.insert(testAnnotations).values(
        test.annotations.map((a, i) => ({
          testPk,
          position: i,
          type: a.type,
          description: a.description,
        })),
      )
    }

    if (test.attachments.length > 0) {
      await tx.insert(testAttachments).values(
        test.attachments.map((a, i) => ({
          testPk,
          position: i,
          name: a.name,
          contentType: a.contentType,
          filename: a.filename,
        })),
      )
    }
  })
}

export async function getTestResult(runId: string, testId: string): Promise<TestRecord | null> {
  const [row] = await db
    .select()
    .from(tests)
    .where(and(eq(tests.runId, runId), eq(tests.testId, testId)))
  if (!row) return null

  const [errors, annotations, attachments] = await Promise.all([
    db.select().from(testErrors).where(eq(testErrors.testPk, row.id)),
    db.select().from(testAnnotations).where(eq(testAnnotations.testPk, row.id)),
    db.select().from(testAttachments).where(eq(testAttachments.testPk, row.id)),
  ])

  return assembleTestRecord(row, errors, annotations, attachments)
}

export async function getTestResults(runId: string): Promise<TestRecord[]> {
  const testRows = await db.select().from(tests).where(eq(tests.runId, runId))
  if (testRows.length === 0) return []

  const ids = testRows.map((r) => r.id)
  const [errors, annotations, attachments] = await Promise.all([
    db.select().from(testErrors).where(inArray(testErrors.testPk, ids)),
    db.select().from(testAnnotations).where(inArray(testAnnotations.testPk, ids)),
    db.select().from(testAttachments).where(inArray(testAttachments.testPk, ids)),
  ])

  return testRows.map((row) =>
    assembleTestRecord(
      row,
      errors.filter((e) => e.testPk === row.id),
      annotations.filter((a) => a.testPk === row.id),
      attachments.filter((a) => a.testPk === row.id),
    ),
  )
}

// ---------- delete operations ----------

export async function deleteRun(runId: string): Promise<boolean> {
  const deleted = await db
    .delete(runs)
    .where(eq(runs.runId, runId))
    .returning({ runId: runs.runId })
  if (deleted.length === 0) return false
  const dir = join(storageConfig.dataDir, runId)
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch (err) {
    console.error(`[storage] failed to remove disk directory for run ${runId}:`, err)
  }
  return true
}

export async function deleteRuns(runIds: string[]): Promise<number> {
  if (runIds.length === 0) return 0
  const deleted = await db
    .delete(runs)
    .where(inArray(runs.runId, runIds))
    .returning({ runId: runs.runId })
  for (const { runId } of deleted) {
    const dir = join(storageConfig.dataDir, runId)
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch (err) {
      console.error(`[storage] failed to remove disk directory for run ${runId}:`, err)
    }
  }
  return deleted.length
}

// ---------- filesystem helpers (binary files remain on disk) ----------

export function getAttachmentsDir(runId: string, testId: string): string {
  const dir = join(storageConfig.dataDir, runId, 'attachments', testId)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function getReportDir(runId: string): string {
  const dir = join(storageConfig.dataDir, runId, 'report')
  mkdirSync(dir, { recursive: true })
  return dir
}

// ---------- timeline / stats ----------

export interface TimelineBucket {
  key: string
  startedAt: string
  runCount: number
  total: number
  passed: number
  failed: number
  flaky: number
  avgDurationMs: number
  p95DurationMs: number
}

export interface TimelineParams {
  project?: string
  branch?: string
  tags?: string[]
  interval: 'run' | 'day' | 'week'
  days?: number
  limit?: number
}

export async function getRunTimeline(params: TimelineParams): Promise<TimelineBucket[]> {
  const { project, branch, tags = [], interval, days = 30, limit } = params

  const conditions: SQL[] = [sql`r.status != 'running'`]
  if (project) conditions.push(sql`r.project = ${project}`)
  if (branch) conditions.push(sql`r.branch = ${branch}`)
  if (tags.length > 0) {
    const tagParams = sql.join(
      tags.map((t) => sql`${t}`),
      sql`, `,
    )
    conditions.push(sql`r.tags @> ARRAY[${tagParams}]::text[]`)
  }

  const where = sql.join(conditions, sql` AND `)

  if (interval === 'run') {
    const limitVal = limit ?? 50
    const rows = await db.execute<{
      key: string
      started_at: string
      run_count: number
      total: number
      passed: number
      failed: number
      flaky: number
      avg_duration_ms: number
      p95_duration_ms: number
    }>(sql`
      SELECT
        r.run_id AS key,
        r.started_at::text AS started_at,
        1 AS run_count,
        COUNT(t.id)::int AS total,
        COUNT(t.id) FILTER (WHERE t.status = 'passed')::int AS passed,
        COUNT(t.id) FILTER (WHERE t.status IN ('failed','timedOut','interrupted'))::int AS failed,
        COUNT(t.id) FILTER (WHERE t.retry > 0 AND t.status = 'passed')::int AS flaky,
        COALESCE(AVG(t.duration_ms)::int, 0) AS avg_duration_ms,
        COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t.duration_ms)::int, 0) AS p95_duration_ms
      FROM runs r
      LEFT JOIN tests t ON t.run_id = r.run_id
      WHERE ${where}
      GROUP BY r.run_id, r.started_at
      ORDER BY r.started_at DESC
      LIMIT ${limitVal}
    `)
    return rows.rows
      .map((r) => ({
        key: r.key,
        startedAt: r.started_at,
        runCount: r.run_count,
        total: r.total,
        passed: r.passed,
        failed: r.failed,
        flaky: r.flaky,
        avgDurationMs: r.avg_duration_ms,
        p95DurationMs: r.p95_duration_ms,
      }))
      .reverse()
  }

  // trunc is safe to use with sql.raw() — value is enum-controlled ('day' or 'week'), never user input
  const trunc = sql.raw(interval === 'week' ? 'week' : 'day')
  const days_int = Math.floor(days)
  const rows = await db.execute<{
    key: string
    started_at: string
    run_count: number
    total: number
    passed: number
    failed: number
    flaky: number
    avg_duration_ms: number
    p95_duration_ms: number
  }>(sql`
    SELECT
      date_trunc('${trunc}', r.started_at)::text AS key,
      MIN(r.started_at)::text AS started_at,
      COUNT(DISTINCT r.run_id)::int AS run_count,
      COUNT(t.id)::int AS total,
      COUNT(t.id) FILTER (WHERE t.status = 'passed')::int AS passed,
      COUNT(t.id) FILTER (WHERE t.status IN ('failed','timedOut','interrupted'))::int AS failed,
      COUNT(t.id) FILTER (WHERE t.retry > 0 AND t.status = 'passed')::int AS flaky,
      COALESCE(AVG(t.duration_ms)::int, 0) AS avg_duration_ms,
      COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY t.duration_ms)::int, 0) AS p95_duration_ms
    FROM runs r
    LEFT JOIN tests t ON t.run_id = r.run_id
    WHERE ${where}
      AND r.started_at >= NOW() - interval '1 day' * ${days_int}
    GROUP BY date_trunc('${trunc}', r.started_at)
    ORDER BY key ASC
  `)
  return rows.rows.map((r) => ({
    key: r.key,
    startedAt: r.started_at,
    runCount: r.run_count,
    total: r.total,
    passed: r.passed,
    failed: r.failed,
    flaky: r.flaky,
    avgDurationMs: r.avg_duration_ms,
    p95DurationMs: r.p95_duration_ms,
  }))
}
