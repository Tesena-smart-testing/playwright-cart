# Self-Hosted Playwright Trace Viewer

**Date:** 2026-04-12  
**Status:** Approved

## Context

Currently, when a user clicks "Open Trace" on the Test result page, the app redirects to `https://trace.playwright.dev` — a third-party service. To allow that external service to fetch the trace file (which is behind auth), the app issues a single-use token (`POST /api/report-token`) and appends it to the file URL. This introduces a hard dependency on an external service and requires a bespoke token mechanism.

The goal is to eliminate that dependency by self-hosting the Playwright trace viewer within the app. The trace viewer ships as a pre-built static bundle inside the `playwright-core` npm package and accepts a `?trace=<url>` query param — identical to how trace.playwright.dev works, but served from our own origin.

## Approach: Copy to `packages/web/public/` at build time

The trace viewer static files are copied from `playwright-core` into `packages/web/public/trace-viewer/` as part of the build process. Vite serves them in dev; Nginx serves them in prod. No new server routes, no production dependency on `playwright-core`.

Since the trace viewer is now same-origin, the existing session cookie provides auth — no tokens needed.

## Architecture

### 1. Build-time copy script

**New file:** `packages/web/scripts/copy-trace-viewer.mjs`

- Uses `import.meta.resolve('playwright-core/package.json')` to locate the package (works with pnpm's content-addressed layout)
- Copies `lib/vite/traceViewer/` → `packages/web/public/trace-viewer/`
- Runs idempotently (overwrites on each run)

**`packages/web/package.json` changes:**
- Add `playwright-core` devDependency (version aligned with `packages/e2e`, e.g. `^1.49.0`)
- Add `"copy-trace-viewer": "node scripts/copy-trace-viewer.mjs"` script
- Add `predev` and `prebuild` hooks that run `copy-trace-viewer`

**`.gitignore`** (web package or root): add `packages/web/public/trace-viewer/`

### 2. Frontend change

**File:** `packages/web/src/components/AttachmentList.tsx` — `TraceButton` component

Replace the async token-fetch flow with a synchronous URL construction:

```ts
// Before
const res = await fetch('/api/report-token', { ... })
const { token } = await res.json()
const traceUrl = `https://trace.playwright.dev/?trace=${encodeURIComponent(
  `${window.location.origin + url}?token=${token}`
)}`
window.open(traceUrl, '_blank', 'noopener,noreferrer')

// After
const traceUrl = `/trace-viewer/?trace=${encodeURIComponent(
  window.location.origin + url
)}`
window.open(traceUrl, '_blank', 'noopener,noreferrer')
```

The `TraceButton` state machine simplifies: remove the `'loading'` state and error recovery (no async call).

### 3. Backend cleanup

**`packages/server/src/app.ts`:**
- Remove `POST /api/report-token` route
- Simplify `/reports/*` auth middleware: remove token-check branch, keep only `authMiddleware`
- Remove `https://trace.playwright.dev` from the `/reports/*` CORS origin allowlist

**`packages/server/src/db/schema.ts`:**
- Remove `reportTokens` table definition and all imports of it

**New Drizzle migration:** `DROP TABLE report_tokens`

**Cleanup any helpers** used exclusively for token hashing/generation (check `storage.ts`, `app.ts`)

### 4. Docker / production

No Dockerfile changes required:
- `pnpm build` triggers `prebuild` → copy script → trace viewer lands in `dist/trace-viewer/`
- Nginx `COPY dist/ /usr/share/nginx/html/` picks it up automatically
- `/trace-viewer/*` is served as static files by Nginx — no proxy rule needed
- Vite dev server serves `public/` directly — no proxy config changes needed

## Data flow

```
User clicks "Open Trace"
  → window.open('/trace-viewer/?trace=<encoded-same-origin-url>')
  → Browser opens /trace-viewer/index.html (served by Vite/Nginx)
  → Trace viewer JS fetches /reports/{runId}/attachments/{testId}/{filename}
  → Session cookie sent automatically (same origin)
  → Server authMiddleware validates cookie → serves file
```

## Files to modify

| File | Change |
|------|--------|
| `packages/web/scripts/copy-trace-viewer.mjs` | New — copy script |
| `packages/web/package.json` | Add devDep, predev/prebuild scripts |
| `packages/web/.gitignore` (or root) | Ignore `public/trace-viewer/` |
| `packages/web/src/components/AttachmentList.tsx` | Simplify TraceButton |
| `packages/server/src/app.ts` | Remove token route + middleware branch |
| `packages/server/src/db/schema.ts` | Remove reportTokens table |
| `packages/server/src/db/migrations/xxxx_drop_report_tokens.sql` | New migration |

## Verification

1. `pnpm --filter @playwright-cart/web predev` → check `packages/web/public/trace-viewer/index.html` exists
2. `pnpm dev` → navigate to a test with a trace attachment → click "Open Trace" → new tab opens at `/trace-viewer/` → trace loads correctly
3. Open browser DevTools Network tab → confirm no requests to `trace.playwright.dev`
4. Confirm no requests to `/api/report-token`
5. `pnpm typecheck` + `pnpm lint` pass
6. `pnpm --filter @playwright-cart/server test` passes (token-related tests removed)
7. Docker build: `docker-compose build` → confirm trace viewer accessible at `http://localhost/trace-viewer/`
