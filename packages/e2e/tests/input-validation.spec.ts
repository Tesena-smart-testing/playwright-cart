import { expect, test } from '@playwright/test'

test.describe('Input Validation', () => {
  test('empty input does not add a todo', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="add-button"]')
    await expect(page.locator('[data-testid="todo-list"]')).toBeEmpty()
  })

  test('pressing Enter key adds a todo', async ({ page }) => {
    await page.goto('/')
    await page.fill('[data-testid="todo-input"]', 'Feed the cat')
    await page.press('[data-testid="todo-input"]', 'Enter')
    await expect(page.locator('[data-testid="todo-list"]')).toContainText('Feed the cat')
  })

  test('character counter updates as user types', async ({ page }) => {
    await page.goto('/')
    await page.fill('[data-testid="todo-input"]', 'Hello')
    // This element does not exist — intentional failure to test dashboard error display
    await expect(page.locator('[data-testid="char-count"]')).toHaveText('5', { timeout: 3000 })
  })
})
