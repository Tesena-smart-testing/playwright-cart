import { expect, test } from '@playwright/test'

test.describe('Accessibility', () => {
  test('page has a visible h1 heading', async ({ page }) => {
    await page.goto('/')
    const heading = page.locator('h1')
    await expect(heading).toBeVisible()
    await expect(heading).not.toBeEmpty()
  })

  test('todo input has an aria-label', async ({ page }) => {
    await page.goto('/')
    // The input has no aria-label in the demo app — intentional failure
    await expect(page.locator('[data-testid="todo-input"]')).toHaveAttribute('aria-label', /todo/i, {
      timeout: 3000,
    })
  })
})
