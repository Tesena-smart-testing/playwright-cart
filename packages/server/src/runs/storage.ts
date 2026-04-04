import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { and, desc, eq, inArray, lt } from 'drizzle-orm'
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
  startedAt: string
  completedAt?: string
  status: 'running' | 'passed' | 'failed' | 'interrupted' | 'timedOut'
  reportUrl?: string
}

export interface TestRecord {
  testId: string
  title: string
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

export async function listRuns(): Promise<RunRecord[]> {
  const rows = await db.select().from(runs).orderBy(desc(runs.startedAt))
  return rows.map(toRunRecord)
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
  rmSync(dir, { recursive: true, force: true })
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
    rmSync(dir, { recursive: true, force: true })
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
