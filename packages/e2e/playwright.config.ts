import { defineConfig } from '@playwright/test'

import 'dotenv/config'

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['html', { open: 'never', outputFolder: 'html-report' }],
    [
      '@playwright-cart/reporter',
      {
        serverUrl: 'http://localhost:3001',
        project: 'e2e-demo',
        branch: process.env.BRANCH ?? 'test',
        commitSha: process.env.COMMIT_SHA ?? '4db6gf7',
        apiKey: process.env.API_KEY,
      },
    ],
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
