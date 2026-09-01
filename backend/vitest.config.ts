import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // Each file gets its own process, and therefore its own SQLite file.
    pool: 'forks',
    testTimeout: 30_000,
  },
})
