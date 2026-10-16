import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/lib/utils.ts', 'src/lib/schemas.ts', 'src/lib/bff.ts', 'src/data/batches.ts', 'src/admin/schemas.ts', 'src/lib/captcha.ts'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
})

