import { expect, test } from '@playwright/test'

test.describe('Todo State', () => {
  test('clicking Done twice toggles item back to undone', async ({ page }) => {
    await page.goto('/')
    await page.fill('[data-testid="todo-input"]', 'Read a book')
    await page.click('[data-testid="add-button"]')
    const item = page.locator('[data-testid="todo-item"]')
    await page.click('[data-testid="complete-button"]')
    await expect(item).toHaveClass(/done/)
    await page.click('[data-testid="complete-button"]')
    await expect(item).not.toHaveClass(/done/)
  })

  test('completed item has "completed" CSS class', async ({ page }) => {
    await page.goto('/')
    await page.fill('[data-testid="todo-input"]', 'Write tests')
    await page.click('[data-testid="add-button"]')
    await page.click('[data-testid="complete-button"]')
    // The app uses class "done", not "completed" — intentional failure
    await expect(page.locator('[data-testid="todo-item"]')).toHaveClass(/completed/, {
      timeout: 3000,
    })
  })
})
