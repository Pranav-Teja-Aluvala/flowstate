import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/office-live',
  outputDir: './office-live-results',
  workers: 1,
  timeout: 150_000,
  use: {
    baseURL: 'http://localhost:3003',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1600, height: 1100 },
  },
  reporter: 'list',
  webServer: {
    command: 'node ./node_modules/next/dist/bin/next start apps/web -p 3003 --hostname 0.0.0.0',
    url: 'http://localhost:3003/login',
    reuseExistingServer: false,
    env: {
      APP_URL: 'http://localhost:3003',
      OFFICE_JWT_SECRET: 'ci_real_office_fixture_secret_at_least_32_characters',
      OFFICE_PUBLIC_URL: 'http://127.0.0.1:8082',
      OFFICE_INTERNAL_URL: 'http://127.0.0.1:8082',
      OFFICE_APP_URL: process.env.OFFICE_LIVE_APP_URL || 'http://host.docker.internal:3003',
    },
  },
});
