# API Reference

All endpoints are served by the server (default: `http://localhost:3001`).

## Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Login with username + password; sets HTTP-only JWT cookie |
| `POST` | `/api/auth/logout` | session | Logout; clears the cookie |
| `GET` | `/api/auth/me` | session | Current user `{ id, username, role, theme }` |

## User Management

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users` | admin | List all users |
| `POST` | `/api/users` | admin | Create a user `{ username, password, role }` |
| `PATCH` | `/api/users/me` | session | Update own username / password / theme |
| `PATCH` | `/api/users/:userId` | admin | Change a user's role |
| `DELETE` | `/api/users/:userId` | admin | Delete a user |

## API Keys

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/api-keys` | admin | List API keys (masked) |
| `POST` | `/api/api-keys` | admin | Create a key `{ label }` — raw key returned once only |
| `DELETE` | `/api/api-keys/:id` | admin | Revoke an API key |

## Settings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings` | session | Get settings `{ data_retention_days }` |
| `PATCH` | `/api/settings` | admin | Update settings |
| `GET` | `/api/settings/llm` | session | Get AI Summary settings `{ enabled, provider, model, isConfigured, providers }` |
| `PATCH` | `/api/settings/llm` | admin | Update AI Summary settings `{ enabled?, provider?, model?, apiKey? }` |

`PATCH /api/settings/llm` notes:

- `apiKey` is optional on update; omitting it keeps the existing encrypted key
- Enabling the feature without an existing or newly supplied key returns `400`

## Test Runs

These endpoints are used by the reporter during a Playwright test run. They require authentication (Bearer API key recommended for CI/CD).

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/runs` | session | Create a new run — returns `{ runId }` |
| `GET` | `/api/runs` | session | List runs (paginated); query params: `page`, `pageSize` (10/25/50/100), `project`, `branch`, `status` |
| `GET` | `/api/runs/meta` | session | Distinct `{ projects, branches }` for filter dropdowns |
| `GET` | `/api/runs/:runId` | session | Run record with all test results |
| `GET` | `/api/runs/:runId/tests/:testId` | session | Fetch a single test result |
| `GET` | `/api/runs/:runId/summary` | session | Get run AI summary or `null` |
| `GET` | `/api/runs/:runId/tests/:testId/summary` | session | Get test AI summary or `null` |
| `POST` | `/api/runs/:runId/tests` | session | Upload a single test result (multipart) |
| `POST` | `/api/runs/:runId/report` | session | Upload zipped HTML report |
| `POST` | `/api/runs/:runId/complete` | session | Mark run complete (no HTML report) |
| `POST` | `/api/runs/:runId/summary/regenerate` | session | Start run summary regeneration; returns `202` |
| `POST` | `/api/runs/:runId/tests/:testId/summary/regenerate` | session | Start test summary regeneration; returns `202` |
| `DELETE` | `/api/runs/:runId` | admin | Delete a single run and all associated data |
| `POST` | `/api/runs/delete-batch` | admin | Delete multiple runs `{ runIds: string[] }` — returns `{ deleted: number }` |

Summary endpoint notes:

- Summary payload shape: `{ status, content, errorMsg, generatedAt, model, provider }`
- Regeneration endpoints are fire-and-forget and return `202` on success
- `404` when run or test does not exist
- `409` with `already_generating` when a summary is already in progress
- `422` with `llm_not_configured` when AI Summary is disabled or missing provider/model/API key configuration

## Events

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/events` | session | SSE stream of run, AI Summary, and settings events; keepalive comment every 15 s |

Current SSE event types:

- `run:created`
- `run:updated`
- `summary_test_start`
- `summary_test_done`
- `summary_test_error`
- `summary_run_start`
- `summary_run_done`
- `summary_run_error`
- `settings:llm_updated`

## Other

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/reports/*` | session | Serve extracted static report files |
| `GET` | `/api/health` | — | Health check — returns `{ ok: true }` |
