import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['dist/**', 'node_modules/**'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
})
