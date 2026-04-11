# Security Audit — 2026-04-11

## Overall Score: 4.7 / 10  (Grade: D)

Penalties: 2 High × 1.5 = 3.0 · 4 Medium × 0.5 = 2.0 · 3 Low × 0.1 = 0.3

## Executive Summary

Significant progress since the 2026-04-10 audit (0.5/10 → 4.7/10). All three Critical
path-traversal RCE vulnerabilities (SA-001–003) and two High auth weaknesses (SA-004, SA-006)
have been correctly fixed. What remains: the JWT_SECRET is still used for three distinct
cryptographic purposes (High); a live API key is committed to git in `packages/e2e/.env`
(High, new finding); nginx ships with no security headers (Medium); and CORS is unconstrained
(Medium). Authentication foundations — bcrypt, httpOnly cookies, jti revocation, rate limiting
— are now solid.

---

## Findings

### High  (CVSS 7.0–8.9)

#### [SA-005] JWT_SECRET dual-used for three distinct cryptographic operations
- **Severity:** High (CVSS 7.5) — unfixed from previous audit
- **Location:** `packages/server/src/app.ts:72,98`, `packages/server/src/auth/middleware.ts`
- **Description:** `JWT_SECRET` is the key for: (1) JWT signing, (2) HMAC for API key hashes
  stored in DB, (3) HMAC for report token hashes stored in DB. Key separation is a fundamental
  cryptographic principle — the same key material must not serve multiple purposes.
- **Impact:** A leaked or brute-forced `JWT_SECRET` lets an attacker forge arbitrary JWTs,
  pre-compute valid API key hashes from any known raw key, and generate valid report tokens
  for any file path. Single-point-of-compromise for all three auth mechanisms.
- **Fix:**

```bash
# .env.example — add two new secrets alongside JWT_SECRET
API_KEY_SECRET=      # openssl rand -hex 32
REPORT_TOKEN_SECRET= # openssl rand -hex 32
```

```typescript
// packages/server/src/auth/utils.ts — add two getter functions
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

Update `hashApiKey` calls in `auth/middleware.ts` and `api-keys/routes.ts` to use
`getApiKeySecret()`. Update the two `hashApiKey` calls in `app.ts` (lines 72 and 98)
that hash report tokens to use `getReportTokenSecret()`.

---

#### [SA-NEW-1] Raw API key committed to git
- **Severity:** High (CVSS 7.3) — new finding
- **Location:** `packages/e2e/.env:1`
- **Description:** `packages/e2e/.env` is tracked by git and contains
  `API_KEY="deb8a025094a3f32ab2ada735506325f9b86a0fb79250ffacdbd1b5fb20f624c"` — a 64-hex
  (32-byte) raw API key in plaintext. Confirmed via `git ls-files packages/e2e/.env`.
- **Impact:** Anyone with repo read access can authenticate as a reporter: upload arbitrary
  test data, create runs, or upload crafted zip/attachment payloads against any running
  instance that still has this key active.
- **Fix:**

Step 1 — Revoke the key immediately via the admin API keys UI before doing anything else.

Step 2 — Remove from git tracking:
```bash
git rm --cached packages/e2e/.env
echo ".env" >> packages/e2e/.gitignore
git commit -m "chore(e2e): untrack .env, add to .gitignore"
```

Step 3 — If the repo is or may become public, purge from history:
```bash
git filter-repo --path packages/e2e/.env --invert-paths
```

Step 4 — Create a documented placeholder:
```bash
# packages/e2e/.env.example
API_KEY=your-api-key-here
```

---

### Medium  (CVSS 4.0–6.9)

#### [SA-007] Nginx ships with no security response headers
- **Severity:** Medium (CVSS 5.3) — unfixed from previous audit
- **Location:** `packages/web/nginx.conf`
- **Description:** Zero security headers in the nginx config. Playwright HTML reports served
  under `/reports/` contain user-controlled JavaScript — without CSP, a malicious test result
  could exfiltrate the authenticated session cookie.
- **Impact:** Clickjacking, MIME sniffing, and stored-XSS escalation via embedded report JS.
- **Fix:**

```nginx
# packages/web/nginx.conf — add to the server {} block (before location blocks)
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;

# CSP only for the SPA — /reports/ uses inline scripts and needs its own policy
location / {
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" always;
  try_files $uri $uri/ /index.html;
}
```

Note: do NOT apply a restrictive CSP to `/reports/` — Playwright HTML reports use inline
scripts and would break. Consider serving reports from a separate subdomain to isolate their
permissions from the main SPA.

---

#### [SA-008] No schema validation on test metadata JSON
- **Severity:** Medium (CVSS 4.5) — unfixed from previous audit
- **Location:** `packages/server/src/runs/routes.ts:72`
- **Description:** `JSON.parse(body.metadata as string) as storage.TestRecord` — the TypeScript
  `as` cast is erased at runtime. No field or length validation. A malformed payload (e.g., a
  10MB `title` string) reaches the DB insert without any guard.
- **Impact:** DB errors surfaced as 500s, potential DoS via large payloads, unexpected nulls in
  required fields causing silent data corruption.
- **Fix:**

```typescript
// packages/server/src/runs/routes.ts — replace the unsafe cast
import { z } from 'zod'

const TestRecordSchema = z.object({
  testId: z.string().max(256),
  runId: z.string().max(256),
  title: z.string().max(1024),
  titlePath: z.array(z.string().max(512)).optional(),
  status: z.enum(['passed', 'failed', 'timedOut', 'skipped']),
  durationMs: z.number().int().nonnegative(),
  retry: z.number().int().nonnegative(),
  // add remaining fields as needed
})

const parsed = TestRecordSchema.safeParse(JSON.parse(body.metadata as string))
if (!parsed.success) return c.json({ error: 'Invalid metadata' }, 400)
const metadata = parsed.data
```

---

#### [SA-009] CORS configured with no origin restriction
- **Severity:** Medium (CVSS 4.3) — unfixed from previous audit
- **Location:** `packages/server/src/app.ts:26,68`
- **Description:** `cors()` with no arguments defaults to `Access-Control-Allow-Origin: *` on
  both `/api/*` and `/reports/*`. Cookie-based auth is protected by `SameSite: Strict`, but
  Bearer-token flows (CI pipelines, scripts) are not — any page can call the API using a key
  stored in `localStorage`.
- **Impact:** Cross-origin requests to the API using Bearer tokens; cross-origin access to
  protected report files if an attacker can supply a valid token.
- **Fix:**

```typescript
// packages/server/src/app.ts
app.use('/api/*', cors({
  origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
}))
// ...
app.use('/reports/*', cors({
  origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
}))
```

Add `ALLOWED_ORIGIN=` to `.env.example`, and wire it up in both compose files.

---

#### [SA-012] No Content-Type / magic-byte validation on zip upload
- **Severity:** Medium (CVSS 3.5) — unfixed from previous audit
- **Location:** `packages/server/src/runs/routes.ts:90`
- **Description:** `POST /:runId/report` accepts any file as the `report` multipart field with
  no MIME type or magic-byte check. Defence-in-depth after SA-001 fix.
- **Fix:**

```typescript
// packages/server/src/runs/routes.ts — after reading zipBuf
// Check zip magic bytes: PK\x03\x04
if (zipBuf[0] !== 0x50 || zipBuf[1] !== 0x4b || zipBuf[2] !== 0x03 || zipBuf[3] !== 0x04) {
  return c.json({ error: 'Not a valid zip file' }, 400)
}
```

---

### Low  (CVSS 0.1–3.9)

#### [SA-010] Hardcoded Postgres credentials in production compose
- **Severity:** Low (CVSS 3.7) — unfixed from previous audit
- **Location:** `docker-compose.prod.yml:14-16`
- **Description:** `POSTGRES_PASSWORD: playwright_cart` is a literal string in the prod compose
  file, checked into source control. The DB port is not externally exposed, but defence-in-depth
  requires unique credentials.
- **Fix:**

```yaml
# docker-compose.prod.yml
POSTGRES_USER: "${POSTGRES_USER}"
POSTGRES_PASSWORD: "${POSTGRES_PASSWORD}"
POSTGRES_DB: "${POSTGRES_DB:-playwright_cart}"
```

---

#### [SA-011] Dev compose JWT_SECRET has a weak, known fallback
- **Severity:** Low (CVSS 3.1) — unfixed from previous audit
- **Location:** `docker-compose.yml:37`
- **Description:** `JWT_SECRET: "${JWT_SECRET:-change-this-secret-in-production}"` — the
  fallback is a publicly known string. If an operator accidentally runs dev compose in a
  reachable environment, all tokens are signed with a guessable secret.
- **Fix:**

```yaml
JWT_SECRET: "${JWT_SECRET:?JWT_SECRET must be set}"
```

---

#### [SA-NEW-2] Server logger emits Authorization headers in plaintext
- **Severity:** Low (CVSS 3.5) — new finding
- **Location:** `packages/server/src/app.ts:25`
- **Description:** `app.use('*', logger())` — Hono's default logger logs full request headers,
  including `Authorization: Bearer <raw-api-key>`. Anyone with access to server logs (CI output,
  log aggregators, sysadmins) can extract raw API keys.
- **Fix:**

```typescript
// packages/server/src/app.ts
app.use('*', logger((str, ...rest) => {
  console.log(
    str.replace(/Authorization:\s*Bearer\s+[a-f0-9]{64}/gi, 'Authorization: Bearer [REDACTED]'),
    ...rest,
  )
}))
```

---

### Info

#### [SA-013] HTTP-only, no HTTPS in dev/compose default
- **Severity:** Info (CVSS 0.0)
- Intentional and correctly documented. `secure` cookie flag gated on `NODE_ENV === 'production'`. Not a finding.

#### [SA-014] Stack traces rendered to UI
- **Severity:** Info (CVSS 0.0)
- **Location:** `packages/web/src/components/ErrorBlock.tsx:12`
- **Description:** `{error.stack}` rendered in UI. No XSS risk (React text node), but leaks
  file paths and library versions to end users in production.
- **Fix:** Guard with `import.meta.env.DEV && error.stack`.

---

## Dependency Audit

```
pnpm audit: 1 vulnerability found — Severity: 1 moderate
```

| Package | Via | Vulnerable | Patched | Advisory |
|---------|-----|-----------|---------|---------|
| `esbuild <=0.24.2` | `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils` | <=0.24.2 | >=0.25.0 | GHSA-67mh-4wv8-2f99 |

Dev-only dependency (used for Drizzle migrations, not bundled into production). Risk is low.
Update `drizzle-kit` when an upstream release pulls in esbuild ≥0.25.0.

---

## What Was Fixed (since 2026-04-10)

| Finding | Fix | Commit |
|---------|-----|--------|
| SA-001 Zip-slip | Entry paths validated before `extractAllTo` | 2812c73 |
| SA-002 Attachment filename traversal | `basename(file.name)` applied | 2812c73 |
| SA-003 testId path traversal | `SAFE_ID` regex on runId + testId | 2812c73 |
| SA-004 No login rate limiting | `hono-rate-limiter` 10 req/15 min | 06838ed |
| SA-006 Logout doesn't invalidate JWT | jti deny list + DB table | 06838ed |

---

## Recommendations Summary

Work through in this order:

1. **[SA-NEW-1]** Revoke exposed API key + untrack `packages/e2e/.env` — do immediately, before anything else
2. **[SA-005]** Split JWT_SECRET into three separate secrets — highest cryptographic blast radius
3. **[SA-009]** Restrict CORS to `ALLOWED_ORIGIN` — one env var + two config lines
4. **[SA-007]** Add security headers to nginx.conf — one block, prevents XSS escalation via reports
5. **[SA-008]** Add Zod validation to test metadata — closes DoS and data integrity gap
6. **[SA-NEW-2]** Redact Authorization headers from logger — one wrapper, prevents key leakage in logs
7. **[SA-010]** Template Postgres credentials in prod compose
8. **[SA-011]** Remove weak JWT_SECRET fallback from dev compose
9. **[SA-012]** Add magic-byte check on zip upload
10. **[SA-014]** Hide stack traces from UI in production
