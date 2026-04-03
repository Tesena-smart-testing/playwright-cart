import { test, expect } from '@playwright/test'

// This test is intentionally designed to fail.
// Its purpose is to verify that the playwright-cart dashboard correctly
// displays failed test states, error messages, and attached traces.
test('intentional failure — verify dashboard shows failure state', async ({ page }) => {
  await page.goto('/')
  // This element does not exist in the demo app — the test will fail with a timeout error.
  await expect(page.locator('[data-testid="nonexistent-element"]')).toBeVisible({ timeout: 3000 })
})
