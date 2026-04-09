import { expect, test } from '@playwright/test'

test.describe('Multiple Todos', () => {
  test('can add multiple todos and all appear in the list', async ({ page }) => {
    await page.goto('/')
    const items = ['Buy groceries', 'Call dentist', 'Fix the bike']
    for (const item of items) {
      await page.fill('[data-testid="todo-input"]', item)
      await page.click('[data-testid="add-button"]')
    }
    const list = page.locator('[data-testid="todo-list"]')
    for (const item of items) {
      await expect(list).toContainText(item)
    }
  })

  test('deleting one todo leaves others intact', async ({ page }) => {
    await page.goto('/')
    await page.fill('[data-testid="todo-input"]', 'First')
    await page.click('[data-testid="add-button"]')
    await page.fill('[data-testid="todo-input"]', 'Second')
    await page.click('[data-testid="add-button"]')
    await page.locator('[data-testid="todo-item"]').first().locator('[data-testid="delete-button"]').click()
    await expect(page.locator('[data-testid="todo-list"]')).not.toContainText('First')
    await expect(page.locator('[data-testid="todo-list"]')).toContainText('Second')
  })

  test('todo count badge reflects number of items', async ({ page }) => {
    await page.goto('/')
    await page.fill('[data-testid="todo-input"]', 'One more thing')
    await page.click('[data-testid="add-button"]')
    // This element does not exist — intentional failure to test dashboard error display
    await expect(page.locator('[data-testid="todo-count"]')).toHaveText('1', { timeout: 3000 })
  })
})
