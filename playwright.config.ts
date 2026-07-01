import { defineConfig, devices } from '@playwright/test';

const E2E_DATABASE_URL = 'postgresql://postgres:password@localhost:5433/manzil_e2e_db';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: 'list',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.js',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'node e2e/setup-db.js && npm run dev --prefix backend',
      port: 5000,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: { DATABASE_URL: E2E_DATABASE_URL },
    },
    {
      command: 'npm run dev --prefix frontend',
      port: 5173,
      timeout: 30_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
