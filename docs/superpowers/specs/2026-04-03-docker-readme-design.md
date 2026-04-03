# Docker + README Completion Spec — Playwright Cart

**Date:** 2026-04-03  
**Status:** Approved  

## Context

The application (reporter, server, web) is functionally complete. What remains is operational polish:
- `README.md` is entirely absent — no onboarding path for new users or contributors
- `docker-compose.yml` is minimal — no health checks, no env var customisation, no dependency ordering
- No `.env.example` to document configurable values

## Scope

Three deliverables:

1. **`README.md`** — dual-audience (end users + contributors)
2. **`docker-compose.yml`** — add health checks, `.env` file support, `DATA_DIR` env var, proper `depends_on` condition
3. **`.env.example`** — document every configurable env var

---

## 1. README.md

### Structure

```
# playwright-cart
One-line tagline

## Features
Bullet list of capabilities

## Architecture
ASCII or text diagram: reporter → server ← web

## Quick Start (Docker)
Prerequisites, clone, docker-compose up, open browser

## Reporter Setup
How to install @playwright-cart/reporter and configure playwright.config.ts

## Configuration
Table: env var | default | description (PORT, DATA_DIR)

## Development
Prerequisites (Node 20, pnpm), pnpm install, pnpm dev, individual package commands

## Running Tests
pnpm --filter <pkg> test commands

## API Reference
Condensed table of all REST endpoints with method, path, description

## Docker Details
docker-compose build, named volume, multi-stage build notes
```

### Tone
- Quick Start section: minimal steps, no explanation — copy-paste first
- Reporter Setup: show full `playwright.config.ts` snippet with all options
- Development section: assume Node/pnpm familiarity, no hand-holding
- API reference: table format, no request/response body detail (CLAUDE.md already has that)

---

## 2. docker-compose.yml Changes

### Health checks

**Server** — polls `GET /api/runs` (returns `[]` when healthy):
```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost:3001/api/runs"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 10s
```

Use `wget` (available on Alpine) rather than `curl` (not always present in Alpine base images).

**Web** — polls nginx root:
```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://localhost/"]
  interval: 10s
  timeout: 5s
  retries: 3
  start_period: 5s
```

### .env file support

Both services gain `env_file: - .env` (Docker Compose silently ignores missing `.env` files, so no breaking change).

### DATA_DIR

Server environment block becomes:
```yaml
environment:
  PORT: "${PORT:-3001}"
  DATA_DIR: "${DATA_DIR:-/app/data}"
```

Volume mount target updated from hard-coded `./data` to use `DATA_DIR`:
```yaml
volumes:
  - reports_data:/app/data
```

Note: the container-side path stays `/app/data` as the default. Users override by setting `DATA_DIR` in `.env` AND updating the volume mount target (documented in README).

### depends_on

Web service updated to:
```yaml
depends_on:
  server:
    condition: service_healthy
```

---

## 3. .env.example

```dotenv
# Server port (default: 3001)
PORT=3001

# Directory where run data and extracted reports are stored (default: /app/data)
DATA_DIR=/app/data
```

---

## Files Modified / Created

| Path | Action |
|---|---|
| `README.md` | Create |
| `docker-compose.yml` | Modify |
| `.env.example` | Create |

## Verification

1. `docker-compose up --build` — both services start, web loads in browser at `http://localhost`
2. `docker-compose ps` — both services show `healthy` status
3. `cp .env.example .env && docker-compose up` — services start with default values
4. README renders correctly on GitHub (check headers, code blocks, table formatting)
