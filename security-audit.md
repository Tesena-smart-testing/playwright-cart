# Security Audit — 2026-04-10

## Overall Score: 0.5 / 10  (Grade: F)

## Executive Summary

Three independent path-traversal vulnerabilities in file upload code allow any authenticated
user (or any CI pipeline with a valid API key) to write arbitrary files anywhere on the server
filesystem — critical-severity, no further preconditions needed. Authentication itself is
well-structured (httpOnly cookies, bcrypt passwords, short-lived JWTs, HMAC-hashed API keys)
but is undermined by no rate limiting on login and a JWT secret that is dual-used for three
distinct cryptographic purposes. The nginx config ships with zero security headers. Production
compose has hardcoded Postgres credentials.

---

## Findings

### Critical  (CVSS 9.0–10.0)

#### [SA-001] Zip-slip via crafted HTML report upload
- **Severity:** Critical (CVSS 9.8)
- **Location:** `packages/server/src/runs/routes.ts:95`
- **Description:** `AdmZip.extractAllTo(dir, true)` extracts entries verbatim. A zip entry
  named `../../etc/cron.d/pwned` will be written outside `dir`. Any authenticated reporter
  (including any CI pipeline holding a valid API key) can upload such a zip via
  `POST /api/runs/:runId/report`.
- **Impact:** Arbitrary file write on server. Attacker can drop a cron job, overwrite startup
  scripts, or replace application source files — leading to full RCE.
- **Fix:**

```typescript
// packages/server/src/runs/routes.ts

import { resolve } from 'node:path'

runs.post('/:runId/report', async (c) => {
  const runId = c.req.param('runId')
  const body = await c.req.parseBody()
  const reportFile = body.report as File
  const completedAt = body.completedAt as string
  const status = body.status as storage.RunRecord['status']

  const zipBuf = Buffer.from(await reportFile.arrayBuffer())
  const zip = new AdmZip(zipBuf)
  const reportDir = storage.getReportDir(runId)
  const resolvedBase = resolve(reportDir)

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    const entryPath = resolve(reportDir, entry.entryName)
    if (!entryPath.startsWith(resolvedBase + '/')) {
      return c.json({ error: 'Invalid archive entry' }, 400)
    }
  }
  zip.extractAllTo(reportDir, true)
  // ... rest unchanged
})
```

Validate every entry path resolves inside `reportDir` before extracting.

---

#### [SA-002] Path traversal via attachment filename
- **Severity:** Critical (CVSS 9.8)
- **Location:** `packages/server/src/runs/routes.ts:77`
- **Description:** `file.name` from a multipart upload goes straight into
  `writeFileSync(join(attachmentsDir, file.name), buf)`. A filename of
  `../../../../etc/cron.d/evil` escapes `attachmentsDir`.
- **Impact:** Same as SA-001 — arbitrary file write, path to RCE.
- **Fix:**

```typescript
// packages/server/src/runs/routes.ts  line 77
import { basename } from 'node:path'

writeFileSync(join(attachmentsDir, basename(file.name)), buf)
```

`path.basename` strips all directory components from the filename.

---

#### [SA-003] Path traversal via `testId` in attachment directory
- **Severity:** Critical (CVSS 9.1)
- **Location:** `packages/server/src/runs/routes.ts:70` and
  `packages/server/src/runs/storage.ts:241`
- **Description:** `testId` comes from the reporter's JSON body
  (`JSON.parse(body.metadata as string).testId`) and flows directly into
  `getAttachmentsDir(runId, metadata.testId)` → `join(dataDir, runId, 'attachments', testId)`.
  A `testId` of `../../sensitive` escapes the attachments directory.
- **Impact:** Combined with SA-002, attacker controls both the directory and the filename of
  written files. Together they provide unrestricted write to the filesystem.
- **Fix:**

```typescript
// packages/server/src/runs/routes.ts — after parsing metadata, before using testId

const SAFE_ID = /^[a-z0-9_\-.]+$/i
if (!SAFE_ID.test(metadata.testId)) {
  return c.json({ error: 'Invalid testId' }, 400)
}
// also validate runId from URL param
const runId = c.req.param('runId')
if (!SAFE_ID.test(runId)) {
  return c.json({ error: 'Invalid runId' }, 400)
}
```

Apply the same validation to `runId` received from URL params in all upload routes
(`/:runId/tests` and `/:runId/report`), since that value too is used in file path construction.

---

### High      (CVSS 7.0–8.9)

#### [SA-004] No rate limiting on login endpoint
- **Severity:** High (CVSS 7.5)
- **Location:** `packages/server/src/auth/routes.ts:11`
- **Description:** `POST /api/auth/login` is the only public API endpoint. It has no
  rate limiting, no lockout, no CAPTCHA. An attacker can brute-force any user's password
  at full network speed.
- **Impact:** Admin account compromise via credential stuffing or password spray. Default
  admin password `changeme123` is trivially cracked if operator forgets to change it.
- **Fix:**

```typescript
// packages/server/src/app.ts — add rate limiter middleware
import { rateLimiter } from 'hono-rate-limiter'  // or use a custom in-memory map

app.use('/api/auth/login', rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  keyGenerator: (c) => c.req.header('x-real-ip') ?? 'unknown',
}))
```

Or implement a simple per-IP counter with `Map` + `setInterval` cleanup if adding a
dependency is undesirable.

---

#### [SA-005] JWT_SECRET dual-used for three distinct cryptographic operations
- **Severity:** High (CVSS 7.5)
- **Location:** `packages/server/src/auth/utils.ts:41`, `packages/server/src/app.ts:63`,
  `packages/server/src/api-keys/routes.ts:42`
- **Description:** `JWT_SECRET` is used as: (1) JWT signing secret, (2) HMAC key for hashing
  API keys, (3) HMAC key for hashing report tokens. Key separation is a fundamental
  cryptographic principle — the same key material should never serve multiple purposes.
  A weakness in any one operation (e.g., JWT timing oracle, key exposure via log) compromises
  all three.
- **Impact:** Leaked or brute-forced JWT_SECRET allows forging JWTs, pre-computing valid
  API key hashes from any known raw key, and generating valid report tokens for any path.
- **Fix:**

```bash
# Add to .env.example
API_KEY_SECRET=<openssl rand -hex 32>   # separate from JWT_SECRET
REPORT_TOKEN_SECRET=<openssl rand -hex 32>
```

```typescript
// packages/server/src/auth/utils.ts
export function getApiKeySecret(): string {
  const s = process.env.API_KEY_SECRET
  if (!s) throw new Error('API_KEY_SECRET not set')
  return s
}
export function getReportTokenSecret(): string {
  const s = process.env.REPORT_TOKEN_SECRET
  if (!s) throw new Error('REPORT_TOKEN_SECRET not set')
  return s
}
```

Update `hashApiKey` calls in `api-keys/routes.ts` and `auth/middleware.ts` to use
`getApiKeySecret()`, and the `hashApiKey` calls in `app.ts` (report-token routes) to use
`getReportTokenSecret()`.

---

#### [SA-006] Logout does not server-side invalidate JWT
- **Severity:** High (CVSS 7.2)
- **Location:** `packages/server/src/auth/routes.ts:41`
- **Description:** Logout only deletes the client-side cookie. The JWT remains
  cryptographically valid until its 8-hour expiry. If the token was captured (XSS, logs,
  network interception), it can still be used after logout.
- **Impact:** Post-logout token replay. Session hijacking window up to 8 hours after
  user believes they have logged out.
- **Fix:** Maintain a server-side deny list (Redis `SET` with TTL, or a DB table) keyed
  by JWT `jti` claim. Insert on logout; check on every `verifyToken` call. Alternatively,
  shorten JWT TTL to 15 minutes and use a refresh-token pattern.

```typescript
// Minimal approach — add jti to token on sign, store in revoked_tokens table on logout
// verifyToken: after signature check, query revoked_tokens for this jti
```

---

### Medium    (CVSS 4.0–6.9)

#### [SA-007] Nginx ships with no security response headers
- **Severity:** Medium (CVSS 5.3)
- **Location:** `packages/web/nginx.conf`
- **Description:** The nginx config sets no `Content-Security-Policy`,
  `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, or
  `Referrer-Policy` headers. HTML reports from Playwright (served under `/reports/`) contain
  arbitrary user-controlled content and JavaScript.
- **Impact:** Clickjacking, MIME sniffing, and XSS via embedded report content. Playwright
  HTML reports run arbitrary JS — without CSP, a malicious test result could exfiltrate
  the authenticated session.
- **Fix:**

```nginx
# packages/web/nginx.conf — add inside the server {} block

add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

# CSP for the SPA itself — reports need a looser policy served separately
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
```

Note: `/reports/` content requires its own CSP evaluation since Playwright HTML reports use
inline scripts. Consider serving reports from a separate origin or subdomain to isolate their
permissions from the main SPA.

---

#### [SA-008] No schema validation on test metadata JSON
- **Severity:** Medium (CVSS 4.5)
- **Location:** `packages/server/src/runs/routes.ts:69`
- **Description:** `JSON.parse(body.metadata as string) as storage.TestRecord` trusts the
  parsed JSON entirely. TypeScript `as` cast is erased at runtime — no field validation
  occurs. Malformed or oversized values (e.g., a `title` field of 10MB) reach the DB insert
  without guards.
- **Impact:** DB errors surfaced as 500s, potential DoS via large payloads, unexpected
  nulls in required fields causing silent data corruption.
- **Fix:** Add a lightweight Zod schema for `TestRecord` and parse with `schema.safeParse()`.
  Reject with 400 on failure. At minimum, validate required string fields are strings and
  within reasonable length bounds.

---

#### [SA-009] CORS configured with no origin restriction
- **Severity:** Medium (CVSS 4.3)
- **Location:** `packages/server/src/app.ts:25`
- **Description:** `app.use('/api/*', cors())` with no `origin` option defaults to
  reflecting `Access-Control-Allow-Origin: *` (or the request origin in some implementations).
  This allows cross-origin JS to call all API endpoints using Bearer token auth.
- **Impact:** A malicious page can make authenticated API requests if the user has an API
  key stored in `localStorage`. Cookie-based auth is protected by `SameSite: Strict` but
  Bearer-based flows are not.
- **Fix:**

```typescript
app.use('/api/*', cors({
  origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
}))
```

---

### Low       (CVSS 0.1–3.9)

#### [SA-010] Hardcoded Postgres credentials in production compose
- **Severity:** Low (CVSS 3.7)
- **Location:** `docker-compose.prod.yml:14-16`
- **Description:** `POSTGRES_USER: playwright_cart` / `POSTGRES_PASSWORD: playwright_cart`
  are literal strings in the prod compose file — checked into source control. `JWT_SECRET`
  and `ADMIN_PASSWORD` are properly templated (`${JWT_SECRET}`) but DB credentials are not.
- **Impact:** Anyone with read access to the repo has the DB password. Low severity because
  the DB port is not exposed in prod, but defense-in-depth requires unique credentials.
- **Fix:** Template the Postgres credentials identically to JWT_SECRET:

```yaml
# docker-compose.prod.yml
environment:
  POSTGRES_USER: "${POSTGRES_USER}"
  POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
  POSTGRES_DB: "${POSTGRES_DB:-playwright_cart}"
```

---

#### [SA-011] Dev compose JWT_SECRET has a weak insecure fallback
- **Severity:** Low (CVSS 3.1)
- **Location:** `docker-compose.yml:37`
- **Description:** `JWT_SECRET: "${JWT_SECRET:-change-this-secret-in-production}"` — the
  fallback value is a known, guessable string. If an operator runs the dev compose in a
  non-dev environment (accidentally or for convenience), all tokens are signed with a
  publicly known secret.
- **Impact:** Token forgery if dev compose is used in a reachable environment.
- **Fix:** Generate the fallback randomly at startup instead of hardcoding it, or remove the
  fallback entirely and let the server throw on missing secret (it already does in `getJwtSecret()`).

```yaml
JWT_SECRET: "${JWT_SECRET:?JWT_SECRET must be set}"
```

---

#### [SA-012] No `Content-Type` validation on file uploads
- **Severity:** Low (CVSS 2.5)
- **Location:** `packages/server/src/runs/routes.ts:73-78`, `:89`
- **Description:** Uploaded files have no `contentType` validation server-side. The zip
  endpoint accepts any file as the `report` field. Attachment endpoint accepts any MIME type.
- **Impact:** Minimal in isolation — file content is written to disk and served, but the main
  threat (path traversal) is covered by SA-001/SA-002. Still worth enforcing expected types.
- **Fix:** For the report endpoint, verify `reportFile.type === 'application/zip'` (or check
  magic bytes). For attachments, optionally whitelist known Playwright attachment MIME types.

---

### Info

#### [SA-013] HTTP-only, no HTTPS in dev/compose default
- **Severity:** Info (CVSS 0.0)
- **Location:** `docker-compose.yml`, `packages/web/nginx.conf`
- **Description:** Dev stack uses plain HTTP. The `secure` cookie flag is gated on
  `NODE_ENV === 'production'`. This is intentional and correctly documented.

#### [SA-014] `password.trim().length` check allows passwords that are all whitespace
- **Severity:** Info (CVSS 0.0)
- **Location:** `packages/server/src/users/routes.ts:32,99`
- **Description:** The empty-password guard uses `.trim().length === 0`, which rejects
  all-whitespace passwords. Good — this is correct defensive behavior. Noted for completeness.

---

## Dependency Audit

```
pnpm audit result: 1 vulnerability found
Severity: 1 moderate
```

| Package | Via | Vulnerable | Patched | Advisory |
|---------|-----|-----------|---------|---------|
| `esbuild <=0.24.2` | `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils` | <=0.24.2 | >=0.25.0 | GHSA-67mh-4wv8-2f99 |

**esbuild dev-server CORS issue** — esbuild's dev server accepts requests from any origin.
This is a `drizzle-kit` transitive dependency, used only during development (migrations/schema
generation), not in the production server bundle. Risk is low but update `drizzle-kit` to a
version that pulls in esbuild >=0.25.0 when available.

---

## Recommendations Summary

Work through in this order:

1. **[SA-001]** Fix zip-slip — validate all archive entry paths before `extractAllTo`. One
   loop, ~5 lines. Highest blast radius of all findings.
2. **[SA-002]** Fix attachment filename — replace `file.name` with `basename(file.name)`. One
   character change. Must be done alongside SA-001.
3. **[SA-003]** Validate `testId` and `runId` against `/^[a-z0-9_\-.]+$/i` before file path
   construction. Closes the last path-traversal vector.
4. **[SA-004]** Add rate limiting to `POST /api/auth/login`. Blocks brute-force, low effort.
5. **[SA-005]** Split `JWT_SECRET` into three separate secrets. Update docker-compose and env
   examples. Prevents cross-purpose key compromise.
6. **[SA-007]** Add security headers to nginx. CSP, X-Frame-Options, X-Content-Type-Options
   — one block in nginx.conf.
7. **[SA-006]** Implement JWT revocation on logout (jti deny list or shorter TTL + refresh
   token).
8. **[SA-008]** Add Zod validation to test metadata parsing.
9. **[SA-009]** Restrict CORS to known origin via `ALLOWED_ORIGIN` env var.
10. **[SA-010]** Template Postgres credentials in docker-compose.prod.yml.
11. **[SA-011]** Remove weak JWT_SECRET fallback from dev compose.
12. **[SA-012]** Add MIME type check on file uploads.
