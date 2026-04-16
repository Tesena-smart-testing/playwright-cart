export type UserRole = 'admin' | 'user'
export type Theme = 'dark' | 'light' | 'system'

export interface CurrentUser {
  id: number
  username: string
  role: UserRole
  theme: Theme
  runsPerPage: number
  expiresAt: number
  chartOrder: string[] | null
}

export type RunStatus = 'running' | 'passed' | 'failed' | 'interrupted' | 'timedOut'
export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'

export interface RunRecord {
  runId: string
  project: string
  branch?: string
  commitSha?: string
  tags: string[]
  startedAt: string
  completedAt?: string
  status: RunStatus
  reportUrl?: string
  flakyCount?: number
}

export interface TestRecord {
  testId: string
  title: string
  tags: string[]
  titlePath: string[]
  location: { file: string; line: number; column: number }
  status: TestStatus
  duration: number
  errors: Array<{ message: string; stack?: string }>
  retry: number
  annotations: Array<{ type: string; description?: string }>
  attachments: Array<{ name: string; contentType: string; filename?: string }>
}

export type AnnotatedTestRecord = TestRecord & { retried?: boolean }

export type TestOutcome = 'expected-failure' | 'unexpected-pass' | 'normal'

export function getTestOutcome(test: Pick<TestRecord, 'status' | 'annotations'>): TestOutcome {
  const hasFailAnnotation = test.annotations.some((a) => a.type === 'fail')
  if (!hasFailAnnotation) return 'normal'
  if (test.status === 'failed') return 'expected-failure'
  if (test.status === 'passed') return 'unexpected-pass'
  return 'normal'
}

export type RunWithTests = RunRecord & { tests: TestRecord[] }
export type AnnotatedRunWithTests = RunRecord & { tests: AnnotatedTestRecord[] }

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

async function getErrorMessage(res: Response, fallbackMessage: string): Promise<string> {
  const rateLimitMessage = 'Too many requests. Please try again later.'

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return res.status === 429 ? rateLimitMessage : fallbackMessage
  }

  try {
    const err = (await res.json()) as { error?: unknown }
    if (typeof err.error === 'string' && err.error.trim()) {
      return err.error
    }
  } catch {
    return res.status === 429 ? rateLimitMessage : fallbackMessage
  }

  return res.status === 429 ? rateLimitMessage : fallbackMessage
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
    throw new Error(await getErrorMessage(res, 'Login failed. Please try again.'))
  }
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

export async function updateMe(data: {
  username?: string
  password?: string
  currentPassword?: string
  theme?: string
  runsPerPage?: number
  chartOrder?: string[] | null
}): Promise<CurrentUser> {
  const res = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to update account settings.'))
  }
  return res.json() as Promise<CurrentUser>
}

export interface PaginatedRuns {
  runs: RunRecord[]
  total: number
  totalPassed: number
  totalFailed: number
  totalCompleted: number
  page: number
  pageSize: number
}

export interface RunsParams {
  page: number
  pageSize: number
  project?: string
  branch?: string
  status?: string
  tags?: string[]
}

export async function fetchRuns(params: RunsParams): Promise<PaginatedRuns> {
  const query = new URLSearchParams()
  query.set('page', String(params.page))
  query.set('pageSize', String(params.pageSize))
  if (params.project) query.set('project', params.project)
  if (params.branch) query.set('branch', params.branch)
  if (params.status) query.set('status', params.status)
  for (const tag of params.tags ?? []) query.append('tag', tag)
  const res = await fetch(`/api/runs?${query}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<PaginatedRuns>
}

export interface RunsMeta {
  projects: string[]
  branches: string[]
  tags: string[]
}

export async function fetchRunsMeta(): Promise<RunsMeta> {
  const res = await fetch('/api/runs/meta')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<RunsMeta>
}

export async function deleteRun(runId: string): Promise<void> {
  const res = await fetch(`/api/runs/${runId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function deleteRunsBatch(runIds: string[]): Promise<{ deleted: number }> {
  const res = await fetch('/api/runs/delete-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ runIds }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<{ deleted: number }>
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

// Users (admin)
export interface UserRecord {
  id: number
  username: string
  role: 'admin' | 'user'
  createdAt: string
}

export async function fetchUsers(): Promise<UserRecord[]> {
  const res = await fetch('/api/users')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<UserRecord[]>
}

export async function createUser(
  username: string,
  password: string,
  role: 'admin' | 'user',
): Promise<UserRecord> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  })
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to create user.'))
  }
  return res.json() as Promise<UserRecord>
}

export async function deleteUser(userId: number): Promise<void> {
  const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function updateUserRole(userId: number, role: 'admin' | 'user'): Promise<UserRecord> {
  const res = await fetch(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to update user role.'))
  }
  return res.json() as Promise<UserRecord>
}

// API Keys (admin)
export interface ApiKeyRecord {
  id: number
  label: string
  maskedKey: string
  createdAt: string
}

export interface CreatedApiKey extends ApiKeyRecord {
  key: string
}

export async function fetchApiKeys(): Promise<ApiKeyRecord[]> {
  const res = await fetch('/api/api-keys')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<ApiKeyRecord[]>
}

export async function createApiKey(label: string): Promise<CreatedApiKey> {
  const res = await fetch('/api/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  })
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to create API key.'))
  }
  return res.json() as Promise<CreatedApiKey>
}

export async function deleteApiKey(keyId: number): Promise<void> {
  const res = await fetch(`/api/api-keys/${keyId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// App Settings
export interface AppSettings {
  data_retention_days: number
}

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch('/api/settings')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<AppSettings>
}

export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error(await getErrorMessage(res, 'Failed to update settings.'))
  }
  return res.json() as Promise<AppSettings>
}

// Charts

export type TimelineInterval = 'run' | 'day' | 'week'

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
  interval: TimelineInterval
  days?: number
  limit?: number
  project?: string
  branch?: string
  tags?: string[]
}

export async function fetchRunTimeline(params: TimelineParams): Promise<TimelineBucket[]> {
  const q = new URLSearchParams()
  q.set('interval', params.interval)
  if (params.days !== undefined) q.set('days', String(params.days))
  if (params.limit !== undefined) q.set('limit', String(params.limit))
  if (params.project) q.set('project', params.project)
  if (params.branch) q.set('branch', params.branch)
  for (const tag of params.tags ?? []) q.append('tag', tag)
  const res = await fetch(`/api/runs/stats/timeline?${q}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { buckets: TimelineBucket[] }
  return data.buckets
}

export interface TestSearchResult {
  testId: string
  title: string
  titlePath: string[]
  locationFile: string
}

export async function fetchTestSearch(q: string, project?: string): Promise<TestSearchResult[]> {
  const params = new URLSearchParams({ q })
  if (project) params.set('project', project)
  const res = await fetch(`/api/tests/search?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { tests: TestSearchResult[] }
  return data.tests
}

export interface TestHistoryEntry {
  runId: string
  startedAt: string
  status: TestStatus
  durationMs: number
  retry: number
  branch: string | null
}

export interface TestHistoryResult {
  test: TestSearchResult
  history: TestHistoryEntry[]
}

export async function fetchTestHistory(
  testId: string,
  limit = 50,
  branch?: string,
): Promise<TestHistoryResult> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (branch) params.set('branch', branch)
  const res = await fetch(`/api/tests/${encodeURIComponent(testId)}/history?${params}`)
  if (res.status === 404) throw new NotFoundError('Test not found')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<TestHistoryResult>
}
