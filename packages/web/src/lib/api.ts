export type UserRole = 'admin' | 'user'
export type Theme = 'dark' | 'light' | 'system'

export interface CurrentUser {
  id: number
  username: string
  role: UserRole
  theme: Theme
  runsPerPage: number
  expiresAt: number
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

export async function updateMe(data: {
  username?: string
  password?: string
  currentPassword?: string
  theme?: string
  runsPerPage?: number
}): Promise<CurrentUser> {
  const res = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
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
    const err = await res.json()
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
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
    const err = await res.json()
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
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
    const err = await res.json()
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
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
    const err = await res.json()
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<AppSettings>
}
