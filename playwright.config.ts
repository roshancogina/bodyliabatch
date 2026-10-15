import { defineConfig, devices } from '@playwright/test'

// Isolation contract:
//  - webServer[0] boots the Go API with APP_ENV=test + DB_NAME=bodyliabatch_test.
//    The backend refuses any non-*_test database in test env (guardTestDB) and
//    refuses to boot in production without real secrets (main.go prod contract).
//  - webServer[1] boots Vite with E2E_* test credentials only — never prod.
//  - .env.test holds the values; this file carries no secrets.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'go run .',
      cwd: '../backend-go',
      url: 'http://localhost:8101/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        APP_ENV: 'test',
        PORT: '8101',
        DB_NAME: 'bodyliabatch_test',
        DB_USER: process.env.E2E_DB_USER ?? 'roshanshah',
        DB_HOST: 'localhost',
        JWT_SECRET: 'test-secret-for-tdd-only',
        GIN_MODE: 'release',
      },
    },
    {
      command: 'npx vite --port 5175 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:5175',
      reuseExistingServer: true,
      timeout: 60_000,
      env: {
        VITE_API_URL: 'http://localhost:8101',
        E2E_API_URL: 'http://127.0.0.1:8101',
        E2E_ADMIN_EMAIL: 'admin@bodylia.in',
        E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD ?? 'Bodylia@2026',
      },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
