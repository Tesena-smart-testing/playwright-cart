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
      │  @playwright-cart/reporter (npm package)
      │  streams results during test run
      ▼
┌─────────────┐        ┌─────────────┐
│   server    │◄───────│     web     │
│  (Hono API) │  /api  │ (React SPA) │
│  port 3001  │        │   port 80   │
└─────────────┘        └─────────────┘
      │
  data volume
  (run.json, attachments, report/)
```

The **server** stores all run data on disk. The **web** frontend is a static React SPA served by Nginx; Nginx proxies `/api` and `/reports` to the server container. The **reporter** npm package is installed in the project under test — not deployed here.

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

## Reporter Setup

Install the reporter in your Playwright project:

```bash
npm install --save-dev @playwright-cart/reporter
# or
pnpm add -D @playwright-cart/reporter
```

Add it to `playwright.config.ts` alongside the HTML reporter:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [
    ['html'],
    ['@playwright-cart/reporter', {
      serverUrl: 'http://localhost:3001', // URL of the playwright-cart server
      project: 'my-app',                 // logical project name
      branch: process.env.BRANCH,        // optional: branch name
      commitSha: process.env.COMMIT_SHA, // optional: commit SHA
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
| `DATA_DIR` | `/app/data` | Directory for run data, attachments, and extracted reports |

Copy `.env.example` to `.env` to customise:

```bash
cp .env.example .env
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
pnpm --filter @playwright-cart/server dev    # tsx watch — server on :3001
pnpm --filter @playwright-cart/web dev       # Vite dev server on :5173
pnpm --filter @playwright-cart/reporter dev  # tsc watch
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
pnpm --filter @playwright-cart/reporter test
pnpm --filter @playwright-cart/reporter test:watch

# Server
pnpm --filter @playwright-cart/server test
pnpm --filter @playwright-cart/server test:watch
```

## API Reference

All endpoints are under the server (default: `http://localhost:3001`).

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/runs` | Create a new run — returns `{ runId }` |
| `GET` | `/api/runs` | List all runs, newest first |
| `GET` | `/api/runs/:runId` | Run record with all test results |
| `GET` | `/api/runs/:runId/tests/:testId` | Fetch a single test result |
| `POST` | `/api/runs/:runId/tests` | Upload a single test result (multipart) |
| `POST` | `/api/runs/:runId/report` | Upload zipped HTML report |
| `POST` | `/api/runs/:runId/complete` | Mark run complete (no HTML report) |
| `GET` | `/reports/*` | Serve extracted static report files |

## Docker Details

The stack uses two containers:

- **server** — Node.js 20 Alpine, built from `packages/server/Dockerfile`
- **web** — Nginx 1.27 Alpine serving the Vite build, proxying to server

Both use multi-stage Docker builds. The named volume `reports_data` persists all run data across container restarts.

```bash
# Rebuild after code changes
docker compose up --build

# View logs
docker compose logs -f

# Check health status
docker compose ps

# Stop and remove containers (data volume preserved)
docker compose down

# Stop and remove containers AND data volume
docker compose down -v
```
