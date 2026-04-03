import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['html', { open: 'never' }],
    ['@playwright-cart/reporter', {
      serverUrl: 'http://localhost:3001',
      project: 'e2e-demo',
      branch: process.env.BRANCH ?? 'local',
      commitSha: process.env.COMMIT_SHA ?? 'manual',
    }],
  ],
  use: {
    baseURL: 'http://localhost:5500',
    trace: 'on',
  },
  webServer: {
    command: 'npx serve demo-app -l 5500',
    url: 'http://localhost:5500',
    reuseExistingServer: true,
  },
})
