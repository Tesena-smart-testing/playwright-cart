import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const storageConfig = {
  dataDir: process.env['DATA_DIR'] ?? './data',
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

export function createRun(run: RunRecord): void {
  const dir = join(storageConfig.dataDir, run.runId)
  mkdirSync(join(dir, 'tests'), { recursive: true })
  mkdirSync(join(dir, 'attachments'), { recursive: true })
  writeFileSync(join(dir, 'run.json'), JSON.stringify(run, null, 2))
}

export function getRun(runId: string): RunRecord | null {
  const path = join(storageConfig.dataDir, runId, 'run.json')
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as RunRecord
}

export function updateRun(runId: string, update: Partial<RunRecord>): void {
  const existing = getRun(runId)
  if (!existing) throw new Error(`Run not found: ${runId}`)
  writeFileSync(
    join(storageConfig.dataDir, runId, 'run.json'),
    JSON.stringify({ ...existing, ...update }, null, 2),
  )
}

export function listRuns(): RunRecord[] {
  if (!existsSync(storageConfig.dataDir)) return []
  return readdirSync(storageConfig.dataDir, { withFileTypes: true })
    .filter(
      e => e.isDirectory() && existsSync(join(storageConfig.dataDir, e.name, 'run.json')),
    )
    .map(
      e =>
        JSON.parse(
          readFileSync(join(storageConfig.dataDir, e.name, 'run.json'), 'utf-8'),
        ) as RunRecord,
    )
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
}

export function writeTestResult(runId: string, test: TestRecord): void {
  writeFileSync(
    join(storageConfig.dataDir, runId, 'tests', `${test.testId}.json`),
    JSON.stringify(test, null, 2),
  )
}

export function getTestResult(runId: string, testId: string): TestRecord | null {
  const path = join(storageConfig.dataDir, runId, 'tests', `${testId}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as TestRecord
}

export function getTestResults(runId: string): TestRecord[] {
  const dir = join(storageConfig.dataDir, runId, 'tests')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as TestRecord)
}

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
