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

## Test Runs

These endpoints are used by the reporter during a Playwright test run. They require authentication (Bearer API key recommended for CI/CD).

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/runs` | session | Create a new run — returns `{ runId }` |
| `GET` | `/api/runs` | session | List all runs, newest first |
| `GET` | `/api/runs/:runId` | session | Run record with all test results |
| `GET` | `/api/runs/:runId/tests/:testId` | session | Fetch a single test result |
| `POST` | `/api/runs/:runId/tests` | session | Upload a single test result (multipart) |
| `POST` | `/api/runs/:runId/report` | session | Upload zipped HTML report |
| `POST` | `/api/runs/:runId/complete` | session | Mark run complete (no HTML report) |

## Other

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/reports/*` | session or `?token=` | Serve extracted static report files; accepts a short-lived single-use token as `?token=<value>` for cross-origin access (e.g. trace.playwright.dev) |
| `POST` | `/api/report-token` | session | Issue a 1-hour single-use token scoped to a single file path `{ path }` — returns `{ token }` |
| `GET` | `/api/health` | — | Health check — returns `{ ok: true }` |
