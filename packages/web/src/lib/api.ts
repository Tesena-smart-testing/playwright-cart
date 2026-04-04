export type UserRole = 'admin' | 'user'
export type Theme = 'dark' | 'light' | 'system'

export interface CurrentUser {
  id: number
  username: string
  role: UserRole
  theme: Theme
}

export type RunStatus = 'running' | 'passed' | 'failed' | 'interrupted' | 'timedOut'
export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'

export interface RunRecord {
  runId: string
  project: string
  branch?: string
  commitSha?: string
  startedAt: string
  completedAt?: string
  status: RunStatus
  reportUrl?: string
}

export interface TestRecord {
  testId: string
  title: string
  titlePath: string[]
  location: { file: string; line: number; column: number }
  status: TestStatus
  duration: number
  errors: Array<{ message: string; stack?: string }>
  retry: number
  annotations: Array<{ type: string; description?: string }>
  attachments: Array<{ name: string; contentType: string; filename?: string }>
}

export type RunWithTests = RunRecord & { tests: TestRecord[] }

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export async function fetchMe(): Promise<CurrentUser | null> {
  const res = await fetch('/api/auth/me')
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<CurrentUser>
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error((err as { error?: string }).error || 'Login failed')
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

export async function fetchRuns(): Promise<RunRecord[]> {
  const res = await fetch('/api/runs')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<RunRecord[]>
}

export async function fetchRun(runId: string): Promise<RunWithTests> {
  const res = await fetch(`/api/runs/${runId}`)
  if (res.status === 404) throw new NotFoundError('Run not found')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<RunWithTests>
}

export async function fetchTest(runId: string, testId: string): Promise<TestRecord> {
  const res = await fetch(`/api/runs/${runId}/tests/${testId}`)
  if (res.status === 404) throw new NotFoundError('Test not found')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<TestRecord>
}
