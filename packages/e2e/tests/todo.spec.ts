import { test, expect } from '@playwright/test'

test('homepage loads with correct title', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Demo Todo App')
})

test('can add a todo item', async ({ page }) => {
  await page.goto('/')
  await page.fill('[data-testid="todo-input"]', 'Buy milk')
  await page.click('[data-testid="add-button"]')
  await expect(page.locator('[data-testid="todo-list"]')).toContainText('Buy milk')
})

test('can mark a todo item as complete', async ({ page }) => {
  await page.goto('/')
  await page.fill('[data-testid="todo-input"]', 'Walk the dog')
  await page.click('[data-testid="add-button"]')
  await page.click('[data-testid="complete-button"]')
  await expect(page.locator('[data-testid="todo-item"]')).toHaveClass(/done/)
})

test('can delete a todo item', async ({ page }) => {
  await page.goto('/')
  await page.fill('[data-testid="todo-input"]', 'Take out trash')
  await page.click('[data-testid="add-button"]')
  await page.click('[data-testid="delete-button"]')
  await expect(page.locator('[data-testid="todo-list"]')).not.toContainText('Take out trash')
})
