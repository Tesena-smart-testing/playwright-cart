/**
 * Seed script: wipes run/test data and fills 90 days of realistic multi-project history.
 * Run with:
 *   DATABASE_URL=postgresql://playwright_cart:playwright_cart@localhost:5432/playwright_cart \
 *     tsx packages/server/src/db/seed-demo.ts
 */

import { sql } from 'drizzle-orm'
import { closeDb, db } from './client.js'
import { runs, testAnnotations, testErrors, tests } from './schema.js'

// ── project definitions ───────────────────────────────────────────────────────

const PROJECTS: Record<
  string,
  {
    branches: string[]
    tags: string[]
    suites: Array<{ name: string; file: string; tests: string[] }>
  }
> = {
  'web-app': {
    branches: ['main', 'develop', 'feature/auth', 'feature/ui-refresh'],
    tags: ['@smoke', '@ui', '@regression'],
    suites: [
      {
        name: 'Authentication',
        file: 'tests/auth.spec.ts',
        tests: [
          'should login with valid credentials',
          'should reject invalid password',
          'should redirect to login when unauthenticated',
          'should remember me across sessions',
          'should logout and clear session',
          'should handle session expiry',
          'should rate-limit failed login attempts',
          'should show validation errors on empty form',
          'should support SSO login',
          'should support password reset flow',
          'should block brute force attempts',
          'should preserve redirect URL after login',
          'should show profile avatar after login',
          'should refresh token silently',
          'should handle concurrent login tabs',
        ],
      },
      {
        name: 'Shopping Cart',
        file: 'tests/cart.spec.ts',
        tests: [
          'should add item to cart',
          'should remove item from cart',
          'should update item quantity',
          'should persist cart across page refreshes',
          'should show cart total correctly',
          'should apply discount code',
          'should reject invalid discount code',
          'should limit item quantity to stock',
          'should show empty cart state',
          'should merge guest cart on login',
          'should calculate shipping cost',
          'should show free shipping threshold',
          'should save cart for later',
          'should move saved item to cart',
          'should clear cart after checkout',
          'should handle out-of-stock items',
          'should show cart item count in header',
          'should handle concurrent cart updates',
          'should preserve cart on browser back',
          'should show item thumbnails in cart',
        ],
      },
      {
        name: 'Checkout Flow',
        file: 'tests/checkout.spec.ts',
        tests: [
          'should proceed through checkout steps',
          'should validate shipping address',
          'should save shipping address for reuse',
          'should show order summary',
          'should process credit card payment',
          'should handle payment decline',
          'should send order confirmation email',
          'should show order tracking number',
          'should handle duplicate order submission',
          'should apply gift card',
          'should calculate taxes correctly',
          'should show estimated delivery date',
          'should support multiple shipping methods',
          'should validate card expiry date',
          'should tokenize card securely',
        ],
      },
      {
        name: 'User Profile',
        file: 'tests/profile.spec.ts',
        tests: [
          'should display user information',
          'should update profile name',
          'should change email address',
          'should change password',
          'should upload profile picture',
          'should manage notification preferences',
          'should view order history',
          'should download invoices',
          'should manage saved addresses',
          'should delete account',
        ],
      },
    ],
  },
  'api-service': {
    branches: ['main', 'develop', 'feature/graphql'],
    tags: ['@api', '@smoke', '@regression'],
    suites: [
      {
        name: 'Users API',
        file: 'src/tests/users.test.ts',
        tests: [
          'GET /users returns paginated list',
          'GET /users/:id returns user',
          'GET /users/:id returns 404 for unknown',
          'POST /users creates new user',
          'POST /users validates required fields',
          'POST /users rejects duplicate email',
          'PATCH /users/:id updates user',
          'PATCH /users/:id validates email format',
          'DELETE /users/:id soft-deletes user',
          'GET /users/me returns current user',
          'GET /users/me requires authentication',
          'POST /users/me/avatar uploads avatar',
          'GET /users search by email',
          'GET /users filter by role',
          'POST /users bulk import',
        ],
      },
      {
        name: 'Products API',
        file: 'src/tests/products.test.ts',
        tests: [
          'GET /products returns catalogue',
          'GET /products/:id returns product',
          'GET /products/:id/variants returns variants',
          'POST /products creates product',
          'POST /products validates price > 0',
          'PATCH /products/:id updates price',
          'DELETE /products/:id archives product',
          'GET /products search by name',
          'GET /products filter by category',
          'GET /products filter by price range',
          'GET /products sort by popularity',
          'POST /products/:id/images upload image',
          'GET /products/featured returns featured',
          'PATCH /products/:id/stock updates stock',
          'GET /products/low-stock returns low stock',
        ],
      },
      {
        name: 'Orders API',
        file: 'src/tests/orders.test.ts',
        tests: [
          'POST /orders creates order',
          'POST /orders validates cart not empty',
          'GET /orders/:id returns order',
          'GET /orders/:id returns 403 for other user',
          'PATCH /orders/:id/cancel cancels order',
          'PATCH /orders/:id/cancel rejects shipped order',
          'GET /orders lists user orders',
          'POST /orders/admin/:id/refund processes refund',
          'GET /orders/admin lists all orders',
          'PATCH /orders/admin/:id/status updates status',
          'GET /orders/:id/tracking returns tracking',
          'POST /orders webhook processes payment event',
          'GET /orders/stats returns summary',
          'POST /orders/:id/invoice generates invoice',
          'GET /orders export to CSV',
        ],
      },
    ],
  },
  'mobile-app': {
    branches: ['main', 'develop', 'feature/dark-mode'],
    tags: ['@ui', '@smoke', '@e2e'],
    suites: [
      {
        name: 'Login',
        file: 'e2e/login.spec.ts',
        tests: [
          'should display login screen',
          'should login with email and password',
          'should show error on invalid credentials',
          'should support biometric login',
          'should support social login',
          'should navigate to forgot password',
          'should auto-fill saved credentials',
          'should handle network timeout on login',
          'should redirect to onboarding for new users',
          'should restore session on app reopen',
        ],
      },
      {
        name: 'Navigation',
        file: 'e2e/navigation.spec.ts',
        tests: [
          'should show bottom tab bar',
          'should navigate to home tab',
          'should navigate to search tab',
          'should navigate to cart tab',
          'should navigate to profile tab',
          'should show back button on nested screens',
          'should support gesture navigation',
          'should restore tab state on switch',
          'should deep link to product page',
          'should handle unknown deep link',
        ],
      },
      {
        name: 'Payment',
        file: 'e2e/payment.spec.ts',
        tests: [
          'should add credit card',
          'should remove saved card',
          'should process Apple Pay',
          'should process Google Pay',
          'should handle card decline',
          'should show payment receipt',
          'should support 3DS verification',
          'should retry failed payment',
          'should apply coupon code',
          'should show instalment options',
          'should display payment history',
          'should export payment receipt',
          'should handle network loss during payment',
          'should validate card number',
          'should validate CVV',
        ],
      },
    ],
  },
  'admin-portal': {
    branches: ['main', 'develop'],
    tags: ['@regression', '@ui'],
    suites: [
      {
        name: 'Dashboard',
        file: 'tests/dashboard.spec.ts',
        tests: [
          'should display revenue chart',
          'should display active users count',
          'should display new orders today',
          'should display top products',
          'should filter by date range',
          'should export dashboard data',
          'should refresh data automatically',
          'should show loading skeleton',
          'should handle API error gracefully',
          'should display system alerts',
        ],
      },
      {
        name: 'User Management',
        file: 'tests/users.spec.ts',
        tests: [
          'should list all users',
          'should search users by name',
          'should filter users by role',
          'should create new admin user',
          'should assign user to role',
          'should deactivate user account',
          'should reactivate user account',
          'should send password reset to user',
          'should view user activity log',
          'should export user list',
          'should bulk deactivate users',
          'should view user orders',
          'should add note to user account',
          'should merge duplicate accounts',
          'should impersonate user account',
        ],
      },
    ],
  },
  'checkout-flow': {
    branches: ['main', 'develop', 'feature/paypal'],
    tags: ['@e2e', '@smoke', '@regression'],
    suites: [
      {
        name: 'Cart',
        file: 'tests/cart.spec.ts',
        tests: [
          'should add product to cart',
          'should update quantity in cart',
          'should remove product from cart',
          'should show cart subtotal',
          'should apply promo code',
          'should calculate shipping estimate',
          'should show stock warning at quantity limit',
          'should persist cart between sessions',
          'should handle concurrent cart modifications',
          'should merge carts on login',
          'should show upsell suggestions',
          'should validate quantity is positive',
          'should show items added from wishlist',
          'should clear cart after order',
          'should show cart on mobile',
        ],
      },
      {
        name: 'Payment Methods',
        file: 'tests/payment.spec.ts',
        tests: [
          'should accept Visa card',
          'should accept Mastercard',
          'should accept PayPal',
          'should accept Apple Pay',
          'should decline expired card',
          'should decline invalid CVV',
          'should handle 3DS challenge',
          'should save card for future use',
          'should use saved card',
          'should remove saved card',
          'should show payment error message',
          'should retry payment on transient error',
          'should apply store credit',
          'should split payment between methods',
          'should show accepted card logos',
        ],
      },
      {
        name: 'Confirmation',
        file: 'tests/confirmation.spec.ts',
        tests: [
          'should show order summary on confirmation',
          'should send confirmation email',
          'should display order number',
          'should show estimated delivery',
          'should provide tracking link',
          'should offer account creation post-checkout',
          'should display receipt for download',
          'should suggest related products',
          'should handle page refresh on confirmation',
          'should redirect home after timeout',
        ],
      },
    ],
  },
}

// ── seeded PRNG (LCG) ─────────────────────────────────────────────────────────

function makePrng(seed: number) {
  let s = seed >>> 0
  return (): number => {
    s = Math.imul(s, 1664525) + 1013904223
    return (s >>> 0) / 0x100000000
  }
}

function randInt(min: number, max: number, r: () => number): number {
  return Math.floor(r() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)]
}

function shuffle<T>(arr: T[], r: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── error templates ───────────────────────────────────────────────────────────

const ERROR_MESSAGES = [
  'Error: expect(received).toBe(expected)\n\nExpected: true\nReceived: false',
  'TimeoutError: page.click: Timeout 30000ms exceeded.\nCall log:\n  - waiting for selector ".submit-btn"',
  'Error: expect(received).toHaveText(expected)\n\nExpected: "Welcome back!"\nReceived: "Invalid credentials"',
  'NetworkError: Failed to fetch resource\n  at XMLHttpRequest.onload (helpers.js:18)',
  'AssertionError: expected response.status 200 to equal 201',
  'TypeError: Cannot read properties of undefined (reading "id")\n  at processResponse (helpers.js:42)',
  'Error: Element not found: [data-testid="success-toast"]',
  'Error: expect(received).toEqual(expected)\n\nExpected: { status: "active" }\nReceived: { status: "pending" }',
  'Error: Navigation timeout exceeded: 30000ms\n  while navigating to /checkout/confirm',
  'AssertionError: expected 3 items but found 2 in cart list',
]

const STACK_TRAIL =
  '\n    at Object.<anonymous> (tests/spec.ts:45:5)\n    at runTest (node_modules/@playwright/test/lib/runner.js:217:13)'

// ── data generation ───────────────────────────────────────────────────────────

type RunInsert = typeof runs.$inferInsert
type TestInsert = typeof tests.$inferInsert
type ErrorInsert = typeof testErrors.$inferInsert
type AnnotationInsert = typeof testAnnotations.$inferInsert

interface TestEntry {
  row: TestInsert
  errors: Omit<ErrorInsert, 'testPk'>[]
  annotations: Omit<AnnotationInsert, 'testPk'>[]
}

const TODAY = new Date('2026-04-17T00:00:00.000Z')
const DAYS = 90
const r = makePrng(20260417)

const projectNames = Object.keys(PROJECTS)
const allRuns: RunInsert[] = []
const allTests: TestEntry[] = []

for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
  const day = new Date(TODAY)
  day.setUTCDate(day.getUTCDate() - dayOffset)

  // 3-5 projects run today
  const dayProjects = shuffle(projectNames, r).slice(0, randInt(3, 5, r))

  for (const projName of dayProjects) {
    const proj = PROJECTS[projName]
    const runsToday = randInt(1, 3, r)

    for (let ri = 0; ri < runsToday; ri++) {
      const startedAt = new Date(day)
      startedAt.setUTCHours(randInt(0, 22, r), randInt(0, 59, r), 0, 0)
      const completedAt = new Date(startedAt.getTime() + randInt(2, 15, r) * 60_000)

      const branch = pick(proj.branches, r)
      const commitSha = Array.from({ length: 8 }, () => randInt(0, 15, r).toString(16)).join('')

      // run profile: 40% green, 40% yellow, 20% red
      const profileRoll = r()
      const profile = profileRoll < 0.4 ? 'green' : profileRoll < 0.8 ? 'yellow' : 'red'

      const runTags = proj.tags.filter(() => r() > 0.4)
      if (runTags.length === 0) runTags.push(proj.tags[0])

      // ensure unique runId even if two runs start at same timestamp
      const runId = `${projName}-${startedAt.getTime()}-r${ri}`

      let anyFailed = false

      for (const suite of proj.suites) {
        for (const testName of suite.tests) {
          const rawId = `${suite.name}--${testName}`
          const testId = rawId.replace(/[^a-z0-9]+/gi, '-').toLowerCase()

          const roll = r()
          let status: 'passed' | 'failed' | 'timedOut' | 'skipped'
          let retry = 0

          if (profile === 'green') {
            if (roll < 0.87) {
              status = 'passed'
            } else if (roll < 0.95) {
              status = 'passed'
              retry = 1
            } else if (roll < 0.99) {
              status = r() < 0.8 ? 'failed' : 'timedOut'
              anyFailed = true
            } else {
              status = 'skipped'
            }
          } else if (profile === 'yellow') {
            if (roll < 0.63) {
              status = 'passed'
            } else if (roll < 0.73) {
              status = 'passed'
              retry = 1
            } else if (roll < 0.96) {
              status = r() < 0.75 ? 'failed' : 'timedOut'
              anyFailed = true
            } else {
              status = 'skipped'
            }
          } else {
            // red
            if (roll < 0.14) {
              status = 'passed'
            } else if (roll < 0.17) {
              status = 'passed'
              retry = 1
            } else if (roll < 0.98) {
              status = r() < 0.7 ? 'failed' : 'timedOut'
              anyFailed = true
            } else {
              status = 'skipped'
            }
          }

          const durationMs =
            status === 'timedOut' ? randInt(25_000, 30_000, r) : randInt(150, 7_500, r)

          const errors: Omit<ErrorInsert, 'testPk'>[] = []
          const annotations: Omit<AnnotationInsert, 'testPk'>[] = []

          if (status === 'failed' || status === 'timedOut') {
            const msg = pick(ERROR_MESSAGES, r)
            errors.push({ position: 0, message: msg, stack: msg + STACK_TRAIL })
          }

          if (r() < 0.05) {
            annotations.push({
              position: 0,
              type: 'fixme',
              description: 'Intermittently fails in CI',
            })
          }

          allTests.push({
            row: {
              testId,
              runId,
              title: testName,
              tags: [],
              titlePath: [suite.name, testName],
              locationFile: suite.file,
              locationLine: randInt(10, 250, r),
              locationCol: 3,
              status,
              durationMs,
              retry,
            },
            errors,
            annotations,
          })
        }
      }

      allRuns.push({
        runId,
        project: projName,
        branch,
        commitSha,
        tags: runTags,
        startedAt,
        completedAt,
        status: anyFailed ? 'failed' : 'passed',
      })
    }
  }
}

// ── insert ────────────────────────────────────────────────────────────────────

console.log('Truncating run/test tables...')
await db.execute(sql`TRUNCATE test_attachments, test_annotations, test_errors, tests, runs CASCADE`)

console.log(`Inserting ${allRuns.length} runs...`)
const RUN_CHUNK = 200
for (let i = 0; i < allRuns.length; i += RUN_CHUNK) {
  await db.insert(runs).values(allRuns.slice(i, i + RUN_CHUNK))
}

console.log(`Inserting ${allTests.length} tests (in chunks)...`)
const pendingErrors: ErrorInsert[] = []
const pendingAnnotations: AnnotationInsert[] = []
const TEST_CHUNK = 500

for (let i = 0; i < allTests.length; i += TEST_CHUNK) {
  const chunk = allTests.slice(i, i + TEST_CHUNK)
  const returned = await db
    .insert(tests)
    .values(chunk.map((t) => t.row))
    .returning({ id: tests.id })

  for (let j = 0; j < chunk.length; j++) {
    const pk = returned[j].id
    for (const e of chunk[j].errors) pendingErrors.push({ ...e, testPk: pk })
    for (const a of chunk[j].annotations) pendingAnnotations.push({ ...a, testPk: pk })
  }

  process.stdout.write(`\r  ${Math.min(i + TEST_CHUNK, allTests.length)} / ${allTests.length}`)
}
console.log()

if (pendingErrors.length > 0) {
  console.log(`Inserting ${pendingErrors.length} test errors...`)
  const ERR_CHUNK = 1000
  for (let i = 0; i < pendingErrors.length; i += ERR_CHUNK) {
    await db.insert(testErrors).values(pendingErrors.slice(i, i + ERR_CHUNK))
  }
}

if (pendingAnnotations.length > 0) {
  console.log(`Inserting ${pendingAnnotations.length} test annotations...`)
  const ANN_CHUNK = 1000
  for (let i = 0; i < pendingAnnotations.length; i += ANN_CHUNK) {
    await db.insert(testAnnotations).values(pendingAnnotations.slice(i, i + ANN_CHUNK))
  }
}

await closeDb()
console.log(`\nDone! ${allRuns.length} runs, ${allTests.length} tests seeded.`)
