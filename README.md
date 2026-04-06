# playwright-cart

A self-hosted dashboard for collecting and viewing Playwright test reports from any CI/CD pipeline.

## Features

- Custom Playwright reporter that uploads test results in real-time
- Centralised dashboard listing all runs with pass/fail stats
- Per-run test detail with errors, annotations, and attachments
- Integrated Playwright trace viewer (served with correct range-request headers)
- Simple Docker deployment — one `docker compose up`

## Architecture

```
playwright tests
      │
      │  @radekbednarik/playwright-cart-reporter (npm package)
      │  streams results during test run
      ▼
┌─────────────┐        ┌─────────────┐
│   server    │◄───────│     web     │
│  (Hono API) │  /api  │ (React SPA) │
│  port 3001  │        │   port 80   │
└─────────────┘        └─────────────┘
      │                      
  PostgreSQL         data volume
  (run + test        (attachments,
   metadata)          report files)
```

The **server** stores run and test metadata in PostgreSQL via Drizzle ORM. Binary files — test attachments (screenshots, traces) and extracted HTML reports — are stored on disk in `DATA_DIR`. The **web** frontend is a static React SPA served by Nginx; Nginx proxies `/api` and `/reports` to the server container. The **reporter** npm package is installed in the project under test — not deployed here.

## Quick Start

**Prerequisites:** Docker + Docker Compose

```bash
git clone https://github.com/radekBednarik/playwright-cart.git
cd playwright-cart
docker compose up --build
```

Open `http://localhost` in your browser.

To run in the background:
```bash
docker compose up --build -d
```

## Authentication

### First login

On first startup the server creates a default admin account from the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables (defaults: `admin` / `changeme123`). Open `http://localhost` and log in with those credentials.

> **Important:** Change the default password (and `JWT_SECRET`) before exposing the instance to a network.

### Roles

| Role | Capabilities |
|---|---|
| `admin` | Manage users, create/revoke API keys, configure settings, view all runs |
| `user` | View all runs, update own username/password/theme |

### Session auth (browser)

The web UI authenticates via username + password. A successful login sets an HTTP-only JWT cookie (`auth_token`, 8-hour expiry). The cookie is sent automatically on every subsequent request.

### API key auth (CI/CD / reporter)

Admins can create API keys in **Settings → API Keys**. The raw key is shown only once — store it securely. Pass it as a Bearer token on any API request:

```
Authorization: Bearer <key>
```

API keys are hashed with SHA256 before storage and can be revoked at any time.

### Reporter authentication

Playwright cart instance requires authentication, pass the API key, that you will be provided by admin in the reporter config:

```ts
['@radekbednarik/playwright-cart-reporter', {
  serverUrl: 'http://your-instance:3001',
  project: 'my-app',
  apiKey: process.env.PLAYWRIGHT_CART_API_KEY, // Bearer token
}]
```

## Reporter Setup

The reporter is published to GitHub Packages under `@radekbednarik/playwright-cart-reporter`.

### 1. Configure registry auth

Create or update `.npmrc` in your project root to route the `@radekbednarik` scope to GitHub Packages.
**This file is safe to check into git, since the NPM_TOKEN is resolved by GitHub Actions.**

```ini
@radekbednarik:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

Set `NPM_TOKEN` to a GitHub PAT (classic) with `read:packages` scope. In CI, add it as a repository secret.

### 2. Install

```bash
npm install --save-dev @radekbednarik/playwright-cart-reporter
# or
pnpm add -D @radekbednarik/playwright-cart-reporter
```

### 3. Configure

Add it to `playwright.config.ts` alongside the HTML reporter:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [
    ['html'],
    ['@radekbednarik/playwright-cart-reporter', {
      serverUrl: 'http://localhost:3001',              // URL of the playwright-cart server (required)
      project: 'my-app',                               // logical project name (required)
      branch: process.env.BRANCH,                      // git branch name (optional)
      commitSha: process.env.COMMIT_SHA,               // git commit SHA (optional)
      apiKey: process.env.PLAYWRIGHT_CART_API_KEY,     // Bearer token for auth (optional)
      uploadConcurrency: 3,                            // max parallel test uploads, default: 3 (optional)
      retries: 3,                                      // upload retry attempts, default: 3 (optional)
      retryDelay: 500,                                 // initial retry backoff in ms, doubles each attempt, default: 500 (optional)
    }],
  ],
})
```

The reporter uploads test results during the run and zips + uploads the HTML report on completion.

## Configuration

Environment variables for the server (set in `.env` or your CI environment):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the server listens on |
| `DATABASE_URL` | *(required)* | PostgreSQL connection string. In Docker Compose this is set automatically. For local dev, copy `.env.example` to `.env` and point at your local instance. |
| `DATA_DIR` | `/app/data` | Directory for binary files: test attachments and extracted HTML reports |
| `ADMIN_USERNAME` | `admin` | Username for the initial admin account (created on first startup if no users exist) |
| `ADMIN_PASSWORD` | `changeme123` | Password for the initial admin account — **change this in production** |
| `JWT_SECRET` | *(insecure default)* | Secret used to sign JWT session tokens. Generate a strong value with `openssl rand -hex 32`. **Must be set in production.** |
| `NODE_ENV` | `development` | Set to `production` to enable secure (HTTPS-only) cookies |

> **Note:** `DATABASE_URL` is automatically set when using `docker compose up`. For local development without Docker, you need a running PostgreSQL instance and `DATABASE_URL` set in your environment or `.env`.

Copy `.env.example` to `.env` to customise:

```bash
cp .env.example .env
```

## Publishing the Reporter

Publishing is automated via GitHub Actions (`.github/workflows/publish-reporter.yml`). To release a new version:

1. Bump the version in `packages/reporter/package.json`
2. Commit and push
3. Create a GitHub Release — the workflow triggers automatically and publishes to GitHub Packages

The workflow uses the built-in `GITHUB_TOKEN` (no extra secrets required). The package is published as `@radekbednarik/playwright-cart-reporter` to `https://npm.pkg.github.com`.

To publish manually:

```bash
export NODE_AUTH_TOKEN=<github-pat-with-write:packages>
pnpm --filter @radekbednarik/playwright-cart-reporter build
pnpm --filter @radekbednarik/playwright-cart-reporter publish --no-git-checks
```

## Development

**Prerequisites:** Node.js ≥ 20, pnpm

```bash
# Install all dependencies
pnpm install

# Start all packages in watch mode (reporter tsc, server tsx, web vite)
pnpm dev
```

The web dev server runs on `http://localhost:5173` and proxies `/api` and `/reports` to the server on port 3001.

Individual packages:

```bash
pnpm --filter @playwright-cart/server dev                        # tsx watch — server on :3001
pnpm --filter @playwright-cart/web dev                           # Vite dev server on :5173
pnpm --filter @radekbednarik/playwright-cart-reporter dev        # tsc watch
```

Build all:

```bash
pnpm build
```

Lint and format (Biome):

```bash
pnpm lint
pnpm format
```

Type-check:

```bash
pnpm typecheck
```

## Running Tests

```bash
# Reporter
pnpm --filter @radekbednarik/playwright-cart-reporter test
pnpm --filter @radekbednarik/playwright-cart-reporter test:watch

# Server
pnpm --filter @playwright-cart/server test
pnpm --filter @playwright-cart/server test:watch
```

## Manual E2E Testing

A self-contained E2E test suite lives in `packages/e2e`. It uses `@radekbednarik/playwright-cart-reporter` directly from the monorepo via `workspace:*` (no npm publish needed) and runs Playwright tests against a tiny static Todo demo app. Use this to manually verify the full reporter → server → dashboard pipeline.

### Prerequisites

- Docker + Docker Compose (to run the server and web dashboard)
- Node.js ≥ 20 + pnpm (already required for development)
- Playwright browsers installed once:
  ```bash
  pnpm --filter @playwright-cart/e2e exec playwright install chromium
  ```

### Running the E2E tests

**1. Start the stack:**

```bash
docker compose up --build -d
```

Wait until both services are healthy:

```bash
docker compose ps   # server and web should show "healthy"
```

**2. Run the tests** (reporter is built automatically via `pretest`):

```bash
pnpm --filter @playwright-cart/e2e test
```

Expect 4 passing tests and 1 intentional failure — the failing test exists to verify that the dashboard correctly displays error states and attached traces.

**3. Open the dashboard:**

Open `http://localhost` in your browser.

### What to verify

| Check | Where |
|-------|-------|
| New run appears with project `e2e-demo` | Runs list |
| Shows 4 passed, 1 failed | Run summary |
| Each test has a trace attachment | Test detail view |
| Failing test shows a timeout error message | Test detail view |
| Trace viewer opens for a test | Click the trace attachment |
| HTML report link is present | Run detail |

### Tear down

```bash
docker compose down          # stop containers, preserve data volume
docker compose down -v       # stop containers AND delete all run data
```

## API Reference

All endpoints are under the server (default: `http://localhost:3001`).

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Login with username + password; sets HTTP-only JWT cookie |
| `POST` | `/api/auth/logout` | session | Logout; clears the cookie |
| `GET` | `/api/auth/me` | session | Current user `{ id, username, role, theme }` |

### User management

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/users` | admin | List all users |
| `POST` | `/api/users` | admin | Create a user `{ username, password, role }` |
| `PATCH` | `/api/users/me` | session | Update own username / password / theme |
| `PATCH` | `/api/users/:userId` | admin | Change a user's role |
| `DELETE` | `/api/users/:userId` | admin | Delete a user |

### API keys

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/api-keys` | admin | List API keys (masked) |
| `POST` | `/api/api-keys` | admin | Create a key `{ label }` — raw key returned once only |
| `DELETE` | `/api/api-keys/:id` | admin | Revoke an API key |

### Settings

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/settings` | — | Get settings `{ data_retention_days }` |
| `PATCH` | `/api/settings` | admin | Update settings |

### Test runs (used by reporter — public)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/runs` | Create a new run — returns `{ runId }` |
| `GET` | `/api/runs` | List all runs, newest first |
| `GET` | `/api/runs/:runId` | Run record with all test results |
| `GET` | `/api/runs/:runId/tests/:testId` | Fetch a single test result |
| `POST` | `/api/runs/:runId/tests` | Upload a single test result (multipart) |
| `POST` | `/api/runs/:runId/report` | Upload zipped HTML report |
| `POST` | `/api/runs/:runId/complete` | Mark run complete (no HTML report) |

### Other

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/reports/*` | — | Serve extracted static report files |
| `GET` | `/api/health` | — | Health check — returns `{ ok: true }` |

## Docker Details

The stack uses three containers:

- **postgres** — PostgreSQL 17 Alpine, stores all run and test metadata
- **server** — Node.js Alpine, built from `packages/server/Dockerfile`; runs DB migrations at startup then starts the Hono API
- **web** — Nginx Alpine serving the Vite build, proxying to server

Both server and web use multi-stage Docker builds. Two named volumes persist data across restarts: `db_data` for the PostgreSQL database, `reports_data` for binary attachments and extracted HTML reports.

```bash
# Rebuild after code changes
docker compose up --build

# View logs
docker compose logs -f

# Check health status
docker compose ps

# Stop and remove containers (volumes preserved)
docker compose down

# Stop and remove containers AND all data (DB + reports)
docker compose down -v
```
