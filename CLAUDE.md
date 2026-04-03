# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
pnpm --filter @playwright-cart/server dev    # tsx watch mode
pnpm --filter @playwright-cart/web dev       # Vite dev server
pnpm --filter @playwright-cart/reporter dev  # tsc watch mode
```

Run tests (reporter and server both use Vitest):
```bash
pnpm --filter @playwright-cart/reporter test       # run once
pnpm --filter @playwright-cart/reporter test:watch # watch mode
pnpm --filter @playwright-cart/server test
pnpm --filter @playwright-cart/server test:watch
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
      ['@playwright-cart/reporter', {
        serverUrl: 'http://localhost:3001',
        project: 'my-app',
        branch: process.env.BRANCH,
        commitSha: process.env.COMMIT_SHA,
      }],
    ],
  })
  ```

**`packages/server`** — Node.js REST API using [Hono](https://hono.dev) + `@hono/node-server`
- `POST /api/runs` — create a new run, returns `{ runId }`
- `GET /api/runs` — list all runs (sorted newest-first)
- `GET /api/runs/:runId` — run record + all test results
- `POST /api/runs/:runId/tests` — upload a single test result with attachments (multipart)
- `POST /api/runs/:runId/report` — upload zipped HTML report, extracts and links it
- `POST /api/runs/:runId/complete` — mark run complete without an HTML report
- `GET /reports/*` — serves extracted static report files (`Service-Worker-Allowed` + cache headers required for Playwright trace viewer)
- On-disk layout: `{DATA_DIR}/{runId}/run.json`, `tests/`, `attachments/`, `report/`
- Env vars: `DATA_DIR` (default `./data`), `PORT` (default `3001`)

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
