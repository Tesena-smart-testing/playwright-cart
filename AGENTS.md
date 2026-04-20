# AGENTS.md

This file provides guidance to AI coding agents (e.g. OpenAI Codex) when working with this repository.

## Agent Behavior

**Always load the caveman skill at the start of every session** and apply its communication rules for all responses.

Prefer repo exploration for implementation detail. Use docs for stable external behavior.

## Commands

```bash
# Development (all packages in watch mode)
pnpm dev

# Build, lint, format, type-check
pnpm build
pnpm lint
pnpm format
pnpm typecheck

# Full stack with Docker
docker compose up
```

Individual packages:

```bash
pnpm --filter @playwright-cart/server dev
pnpm --filter @playwright-cart/web dev
pnpm --filter playwright-cart-reporter dev
```

Tests:

```bash
pnpm --filter playwright-cart-reporter test
pnpm --filter @playwright-cart/server test
pnpm --filter @playwright-cart/web test
pnpm --filter @playwright-cart/e2e test
```

## Project Shape

Monorepo for collecting and viewing Playwright test reports. Uses **pnpm workspaces** + **Turbo** + **Biome**.

- `packages/reporter`: Playwright reporter package that streams test results and uploads HTML reports
- `packages/server`: Hono API + Drizzle + PostgreSQL
- `packages/web`: React 19 + Vite dashboard
- `packages/e2e`: full-stack Playwright tests against demo app

## Critical Facts

- All `/api/*` routes require auth except `POST /api/auth/login` and `GET /api/health`
- Browser auth uses HTTP-only JWT cookie; CI/reporter auth uses Bearer API keys
- Metadata lives in PostgreSQL; attachments and extracted HTML reports live on disk in `DATA_DIR`
- AI Summary feature is configured in **Settings -> AI Summaries** and uses provider abstraction under `packages/server/src/ai/`
- On server boot, any stuck AI summaries in `generating` state are marked `error`
- Retention job deletes old runs and associated files from both DB and disk
- In dev, web proxies `/api` and `/reports` to server on port `3001`

## Docs

- `README.md`: product overview, setup, AI Summary behavior
- `docs/api.md`: endpoint and SSE reference
- `docs/deployment.md`: production deployment
