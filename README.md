# playwright-cart

A self-hosted dashboard for collecting and viewing Playwright test reports from any CI/CD pipeline.

## What is playwright-cart?

When you run Playwright tests across multiple projects, branches, or CI pipelines, results end up scattered in ephemeral job logs and short-lived HTML report artifacts. playwright-cart gives you a permanent, centralized place to collect and browse them.

It has three parts: a **reporter** npm package you add to your Playwright config, a **server** that receives results during test runs and stores them in PostgreSQL, and a **dashboard** (React SPA) for browsing runs, inspecting individual test results, viewing screenshots and traces, opening the full Playwright HTML report, and reading AI-generated summaries for failing runs and tests. Everything is self-hosted — you own your data.

## Quick Start

**Prerequisites:** Docker + Compose plugin

```bash
git clone https://github.com/radekBednarik/playwright-cart.git
cd playwright-cart
docker compose up --build
```

Open `http://localhost` in your browser. Log in with the default credentials: `admin` / `changeme123`.

> **Change the default password and set a strong `JWT_SECRET` before exposing this instance to a network.** `JWT_SECRET` protects session tokens and encrypted AI provider API keys. See [Configuration](#configuration).

To run in the background:

```bash
docker compose up --build -d
docker compose logs -f   # follow logs
docker compose ps        # check health status
```

To stop:

```bash
docker compose down       # stop containers, preserve data
docker compose down -v    # stop containers and delete all data
```

---

## Reporter Setup

The reporter is published as a public npm package under `playwright-cart-reporter`.

### 1. Install

Install it in your Playwright project (not in this repo):

```bash
npm install --save-dev playwright-cart-reporter
# or
pnpm add -D playwright-cart-reporter
```

### 2. Configure in `playwright.config.ts`

Add the reporter alongside the HTML reporter:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [
    ['html'],
    ['playwright-cart-reporter', {
      serverUrl: 'http://localhost:3001',              // URL of your playwright-cart server (required)
      project: 'my-app',                               // logical project name shown in the dashboard (required)
      branch: process.env.BRANCH,                      // git branch name (optional)
      commitSha: process.env.COMMIT_SHA,               // git commit SHA (optional)
      tags: ['@smoke', '@checkout'],                   // tags shown in UI and filterable later (optional)
      apiKey: process.env.PLAYWRIGHT_CART_API_KEY,     // Bearer token for auth (required)
      uploadConcurrency: 3,                            // max parallel test uploads, default: 3 (optional)
      retries: 3,                                      // upload retry attempts per test, default: 3 (optional)
      retryDelay: 500,                                 // initial retry backoff in ms, doubles each attempt, default: 500 (optional)
    }],
  ],
})
```

The reporter streams test results to the server during the run and uploads the zipped Playwright HTML report on completion. Run-level tags from reporter config and test-level tags from Playwright are stored and exposed in the dashboard filters. In deployed setups, reporter uploads should use an API key because all non-public `/api/*` routes require authentication.

---

## Authentication

### First login

On first startup the server creates an admin account from the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables. Log in at `http://localhost` and change the password immediately.

### Roles

| Role | Capabilities |
|------|-------------|
| `admin` | Manage users, create/revoke API keys, configure retention settings, view and delete all runs |
| `user` | View all runs, update own username/password/theme/runs-per-page setting |

### API keys for CI/CD

For the reporter and any CI/CD tooling, use an API key instead of a password. Admins can create keys in **Settings → API Keys**. The raw key is shown only once — store it as a secret immediately.

Pass the key as a Bearer token:

```
Authorization: Bearer <key>
```

Or via the reporter config:

```ts
apiKey: process.env.PLAYWRIGHT_CART_API_KEY,
```

API keys are HMAC-SHA256-hashed with `JWT_SECRET` before storage and can be revoked at any time.

---

## Dashboard

### AI Summary

playwright-cart can generate AI summaries for non-passing runs and tests to speed up failure diagnosis.

- Enable it in **Settings -> AI Summaries**
- Current shipped provider: `anthropic`
- Current shipped models: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- The server auto-starts summary generation when a run completes with status `failed`, `interrupted`, or `timedOut`
- Test summaries are generated first for non-passing tests, then a run summary is generated from those results
- Users can manually regenerate summaries from the `✦ AI Summary` tab on run and test detail pages
- When the feature is disabled, the `✦ AI Summary` tab is hidden

### AI Summary setup

1. Sign in as an admin.
2. Open **Settings -> AI Summaries**.
3. Enable the feature.
4. Choose provider and model.
5. Paste the provider API key and save.

Notes:

- The API key is encrypted at rest in the database using `JWT_SECRET`-derived key material
- The raw key is never returned by the API; settings only expose `isConfigured`
- If the server restarts mid-generation, in-progress summaries are marked as `error` and can be regenerated from the UI

### Annotation-based status inversion (`type: fail`)

The dashboard understands Playwright's [`test.fail()`](https://playwright.dev/docs/api/class-test#test-fail) annotation. When a test carries an annotation with `type: 'fail'`, the dashboard inverts its displayed status:

| Raw status | Annotation | Displayed as | Label |
|---|---|---|---|
| `failed` | `type: 'fail'` | **passed** (green) | `expected failure` (purple pill) |
| `passed` | `type: 'fail'` | **failed** (red) | `unexpected pass` (red pill) |

This inversion is applied consistently across all views:

- **Test detail page** — status badge and secondary label pill
- **Suite tree** — icon next to each test row
- **Suite header** — failure counter (`N failed`)
- **Run header** — pass-rate bar and stat pills (`N passed` / `N failed`)

This applies also for the `Failures` chart. The expected failures are not reported in this chart. Unexpected failures are.

---

## Configuration

Environment variables for the server. When using `docker compose up`, `DATABASE_URL` is set automatically. For local development without Docker, copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the server listens on |
| `DATABASE_URL` | *(required)* | PostgreSQL connection string |
| `DATA_DIR` | `./data` | Directory for binary files: attachments and extracted HTML reports. `docker compose` overrides this to `/app/data`. |
| `ADMIN_USERNAME` | `admin` | Username for the initial admin account |
| `ADMIN_PASSWORD` | `changeme123` | Password for the initial admin account — **change in production** |
| `JWT_SECRET` | *(insecure default)* | Secret for signing JWT session tokens and encrypting stored AI provider API keys. Generate with `openssl rand -hex 32`. **Must be set in production.** |
| `NODE_ENV` | `development` | Set to `production` to enable secure (HTTPS-only) cookies |
| `ALLOWED_ORIGIN` | `http://localhost:5173` | CORS allowed origin for `/api/*`. Set to your dashboard URL in production. |

---

## Deployment

For deploying playwright-cart to a production server with HTTPS, see the [Deployment Guide](docs/deployment.md). It covers provisioning a VPS, installing Coolify as a self-hosted PaaS, and deploying the full stack with automatic SSL.

---

## Developer

### Architecture

```
playwright tests
      │
      │  playwright-cart-reporter (npm package)
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

The **server** stores run and test metadata in PostgreSQL via Drizzle ORM. Binary files — attachments (screenshots, traces) and extracted HTML reports — are stored on disk in `DATA_DIR`. The **web** frontend is a static React SPA served by Nginx; Nginx proxies `/api` and `/reports` to the server. The **reporter** is installed in the project under test, not here.

### Local development

**Prerequisites:** Node.js ≥ 20, pnpm

```bash
pnpm install
pnpm dev        # starts all packages in watch mode
```

The web dev server runs on `http://localhost:5173` and proxies `/api` and `/reports` to the server on port 3001.

Individual packages:

```bash
pnpm --filter @playwright-cart/server dev                        # tsx watch — server on :3001
pnpm --filter @playwright-cart/web dev                           # Vite dev server on :5173
pnpm --filter playwright-cart-reporter dev                       # tsc watch
```

Build, lint, and type-check:

```bash
pnpm build
pnpm lint
pnpm format
pnpm typecheck
```

### Running tests

```bash
pnpm --filter playwright-cart-reporter test
pnpm --filter playwright-cart-reporter test:watch

pnpm --filter @playwright-cart/server test
pnpm --filter @playwright-cart/server test:watch

pnpm --filter @playwright-cart/web test
pnpm --filter @playwright-cart/web test:watch
```

### E2E testing

A self-contained E2E suite lives in `packages/e2e`. It uses the workspace reporter package directly (no npm publish needed) and runs Playwright tests against a small static demo app, verifying the full reporter → server → dashboard pipeline.

**Prerequisites:** Docker + Compose plugin, Playwright browsers:

```bash
pnpm --filter @playwright-cart/e2e exec playwright install chromium
```

**Run the suite:**

```bash
# 1. Start the stack
docker compose up --build -d
docker compose ps   # wait until server and web show "healthy"

# 2. Run the tests (reporter is built automatically via pretest)
pnpm --filter @playwright-cart/e2e test

# 3. Open the dashboard
# visit http://localhost in your browser
```

Expect 4 passing tests and 1 intentional failure — the failing test verifies that the dashboard correctly displays error states and attached traces.

| Check | Where |
|-------|-------|
| New run with project `e2e-demo` | Runs list |
| 4 passed, 1 failed | Run summary |
| Trace attachment on each test | Test detail view |
| Timeout error on the failing test | Test detail view |
| Trace viewer opens | Click a trace attachment |
| HTML report link present | Run detail |

**Tear down:**

```bash
docker compose down      # stop containers, preserve data
docker compose down -v   # stop containers and delete all data
```

### Further reading

- [API Reference](docs/api.md) — all REST endpoints with auth requirements
- [Deployment Guide](docs/deployment.md) — production deployment on Hetzner + Coolify
