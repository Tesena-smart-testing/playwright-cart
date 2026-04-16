import { and, desc, eq, ilike } from 'drizzle-orm'
import { db } from '../db/client.js'
import { runs, tests } from '../db/schema.js'

export interface TestSearchResult {
  testId: string
  title: string
  titlePath: string[]
  locationFile: string
}

export async function searchTests(q: string, project?: string): Promise<TestSearchResult[]> {
  const rows = await db
    .selectDistinctOn([tests.testId], {
      testId: tests.testId,
      title: tests.title,
      titlePath: tests.titlePath,
      locationFile: tests.locationFile,
    })
    .from(tests)
    .innerJoin(runs, eq(tests.runId, runs.runId))
    .where(
      project
        ? and(ilike(tests.title, `%${q}%`), eq(runs.project, project))
        : ilike(tests.title, `%${q}%`),
    )
    .orderBy(tests.testId, desc(runs.startedAt))
    .limit(20)
  return rows
}

export interface TestHistoryEntry {
  runId: string
  startedAt: string
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'
  durationMs: number
  retry: number
  branch: string | null
}

export interface TestHistoryResult {
  test: TestSearchResult | null
  history: TestHistoryEntry[]
}

export async function getTestHistory(
  testId: string,
  limit = 50,
  branch?: string,
): Promise<TestHistoryResult> {
  const baseCondition = branch
    ? and(eq(tests.testId, testId), eq(runs.branch, branch))
    : eq(tests.testId, testId)

  const rows = await db
    .select({
      runId: runs.runId,
      startedAt: runs.startedAt,
      status: tests.status,
      durationMs: tests.durationMs,
      retry: tests.retry,
      branch: runs.branch,
      testId: tests.testId,
      title: tests.title,
      titlePath: tests.titlePath,
      locationFile: tests.locationFile,
    })
    .from(tests)
    .innerJoin(runs, eq(tests.runId, runs.runId))
    .where(baseCondition)
    .orderBy(desc(runs.startedAt))
    .limit(limit)

  if (rows.length === 0) return { test: null, history: [] }

  const first = rows[0]
  return {
    test: {
      testId: first.testId,
      title: first.title,
      titlePath: first.titlePath as string[],
      locationFile: first.locationFile,
    },
    history: rows.map((r) => ({
      runId: r.runId,
      startedAt: r.startedAt.toISOString(),
      status: r.status,
      durationMs: r.durationMs,
      retry: r.retry,
      branch: r.branch ?? null,
    })),
  }
}
