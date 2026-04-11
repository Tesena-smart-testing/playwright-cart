# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Agent Behavior

**Always load the caveman skill at the start of every session** by reading `.agents/skills/caveman/SKILL.md` and applying its communication rules for all responses.

## Commands

```bash
# Development (all packages in watch mode)
pnpm dev

# Build all packages
pnpm build

# Lint (Biome)
pnpm lint

# Format (Biome)
pnpm format

# Type-check all packages
pnpm typecheck

# Run full stack with Docker
docker-compose up
```

Individual package commands (from root with `--filter`):
```bash
pnpm --filter @playwright-cart/server dev                        # tsx watch mode
pnpm --filter @playwright-cart/web dev                           # Vite dev server
pnpm --filter @radekbednarik/playwright-cart-reporter dev        # tsc watch mode
```

Run tests (reporter and server both use Vitest):
```bash
pnpm --filter @radekbednarik/playwright-cart-reporter test       # run once
pnpm --filter @radekbednarik/playwright-cart-reporter test:watch # watch mode
pnpm --filter @playwright-cart/server test
pnpm --filter @playwright-cart/server test:watch
```

Run e2e tests (requires server + DB running):
```bash
pnpm --filter @playwright-cart/e2e test      # headless; pretest builds reporter first
pnpm --filter @playwright-cart/e2e test:ui   # Playwright UI mode
```

Publish reporter (triggered automatically on GitHub Release):
```bash
# Manual publish — requires NODE_AUTH_TOKEN with write:packages scope
pnpm --filter @radekbednarik/playwright-cart-reporter build
pnpm --filter @radekbednarik/playwright-cart-reporter publish --no-git-checks
```

## Architecture

A monorepo for collecting and viewing Playwright test reports in a centralized dashboard. Uses **pnpm workspaces** + **Turbo** for orchestration, **Biome** for linting/formatting.

### Packages

**`packages/reporter`** — Playwright custom reporter (`Reporter` interface from `@playwright/test`)
- Implements `onBegin`, `onTestEnd`, `onEnd` lifecycle hooks
- `onBegin` fires run creation (fire-and-forget, since Playwright requires it synchronous); `onTestEnd` streams per-test uploads concurrently via `Semaphore`; `onEnd` drains all uploads then zips + uploads the HTML report
- Zips the `playwright-report/` dir (or the configured `outputFolder`) only when Playwright's `html` reporter is also enabled
- Published as an npm package for consumers to add to their `playwright.config.ts`:
  ```ts
  // playwright.config.ts
  import { defineConfig } from '@playwright/test'
  export default defineConfig({
    reporter: [
      ['html'],
      ['@radekbednarik/playwright-cart-reporter', {
        serverUrl: 'http://localhost:3001',              // required
        project: 'my-app',                               // required
        branch: process.env.BRANCH,                      // optional
        commitSha: process.env.COMMIT_SHA,               // optional
        apiKey: process.env.PLAYWRIGHT_CART_API_KEY,     // optional: Bearer token for auth
        uploadConcurrency: 3,                            // optional: max parallel test uploads, default: 3
        retries: 3,                                      // optional: upload retry attempts, default: 3
        retryDelay: 500,                                 // optional: initial retry backoff ms, doubles each attempt, default: 500
      }],
    ],
  })
  ```

**`packages/server`** — Node.js REST API using [Hono](https://hono.dev) + `@hono/node-server`
- Uses **Drizzle ORM** + PostgreSQL for structured data
- Binary files (screenshots, traces, extracted HTML reports) remain on disk at `{DATA_DIR}/{runId}/attachments/` and `{DATA_DIR}/{runId}/report/`
- Runs DB migrations at startup via `src/db/migrate.ts` (Drizzle migrate)
- Env vars: `DATABASE_URL` (required), `DATA_DIR` (default `./data`), `PORT` (default `3001`), `ADMIN_USERNAME` (default `admin`), `ADMIN_PASSWORD` (default `changeme123`), `JWT_SECRET` (required in production), `NODE_ENV` (`production` enables secure cookies), `ALLOWED_ORIGIN` (CORS allowed origin, default `http://localhost:5173`; prod compose requires explicit value)

**DB schema** (`src/db/schema.ts`):
- `runs` — `runId`, `project`, `branch`, `commitSha`, `startedAt`, `completedAt`, `status`, `reportUrl`
- `tests` — `id`, `testId`, `runId` (FK), `title`, `titlePath`, `locationFile/Line/Col`, `status`, `durationMs`, `retry`
- `test_errors` — `id`, `testPk` (FK), `position`, `message`, `stack`
- `test_annotations` — `id`, `testPk` (FK), `position`, `type`, `description`
- `test_attachments` — `id`, `testPk` (FK), `position`, `name`, `contentType`, `filename`
- `users` — `id`, `username` (unique), `passwordHash` (bcrypt), `role` (admin|user), `theme` (dark|light|system)
- `api_keys` — `id`, `keyHash` (SHA256, unique), `label`, `createdBy` (FK → users)
- `app_settings` — `key` (PK), `value` (currently stores `data_retention_days`; default 90 days)
- `report_tokens` — `id`, `tokenHash` (HMAC-SHA256, unique), `filePath`, `expiresAt` (1h); single-use (deleted on consumption), expired rows cleaned up on creation

**Retention job** (`src/retention.ts`):
- `startRetentionJob()` runs hourly via `setInterval`; deletes runs (and cascades to all child rows + disk files) older than `data_retention_days` setting (default 90)
- Started in `src/index.ts` at server boot

**Authentication** (`src/auth/`):
- Dual auth: HTTP-only JWT cookie (`auth_token`, HS256, 8h) for browser sessions; `Authorization: Bearer <key>` API keys for CI/CD
- Roles: `admin` (full control) and `user` (self-service only)
- Middleware: `authMiddleware` (requires any auth), `adminMiddleware` (requires admin role)
- **All `/api/*` routes require auth** except `POST /api/auth/login` and `GET /api/health` — this means reporter uploads require `apiKey` in any deployed setup
- `GET /reports/*` requires session cookie or a valid `?token=<value>` query param (single-use, 1h expiry, issued by `POST /api/report-token`)
- Admin bootstrap: on startup, `src/db/seed.ts` creates the default admin from `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars (idempotent)
- API keys: 32-byte random hex generated, HMAC-SHA256-hashed before DB storage, raw key shown only at creation

**Routes** (`src/app.ts`):
- `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/auth/me` — auth (login public; others require session)
- `GET|POST /api/users` / `PATCH /api/users/me` / `PATCH|DELETE /api/users/:id` — user management (admin, except PATCH me = any authed user)
- `GET|POST|DELETE /api/api-keys` — API key management (admin)
- `GET /api/settings` / `PATCH /api/settings` — settings (any authed / admin)
- `POST /api/runs` / `GET /api/runs` / `GET /api/runs/:runId` — run CRUD (any authed)
- `DELETE /api/runs/:runId` / `POST /api/runs/delete-batch` — run deletion (admin)
- `POST /api/runs/:runId/tests` / `POST /api/runs/:runId/report` / `POST /api/runs/:runId/complete` — reporter upload (any authed; use `apiKey`)
- `POST /api/report-token` — issue single-use report token (any authed)
- `GET /api/events` — SSE stream of run lifecycle events (any authed)
- `GET /reports/*` — static report files (session cookie or `?token=`)
- `GET /api/health` — health check (public)

**`packages/e2e`** — End-to-end integration tests for the full stack
- Serves a static `demo-app/` (a simple todo app) via `npx serve` on port 5500 as the test target
- Uses `@playwright-cart/reporter` from the workspace (built by `pretest` before each run)
- Requires a running server + DB and optionally `API_KEY` env var; configure via `.env` in the package
- `playwright.config.ts` uses `project: 'e2e-demo'` and posts results to `http://localhost:3001`

**`packages/web`** — React 19 + Vite frontend
- Lists uploaded reports with project name, upload time, and test status
- Opens report in new tab (requires HTTP not HTTPS for service worker)
- In dev: Vite proxies `/api` and `/reports` to server on port 3001
- In production: Nginx serves static files and proxies to server

### Docker

- Server: port 3001, mounts shared volume at `/app/data`
- Web: port 80 via Nginx, proxies to server container
- `docker-compose up` starts the full stack

### TypeScript config

Root `tsconfig.json` defines base settings; each package extends it and uses project references. Strict mode enabled.

### Code style

Biome enforces single quotes and 100-character line width across the entire monorepo.
