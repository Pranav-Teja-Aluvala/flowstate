import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/office-e2e',
  outputDir: './office-test-results',
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3002', trace: 'retain-on-failure' },
  reporter: 'list',
  webServer: {
    command: 'node ./node_modules/next/dist/bin/next start apps/web -p 3002',
    url: 'http://localhost:3002/login',
    reuseExistingServer: false,
    env: {
      APP_URL: 'http://localhost:3002',
      OFFICE_JWT_SECRET: 'office_browser_fixture_secret_at_least_32_characters',
      OFFICE_PUBLIC_URL: 'http://127.0.0.1:1240',
      OFFICE_INTERNAL_URL: 'http://127.0.0.1:1240',
      OFFICE_APP_URL: 'http://localhost:3002',
    },
  },
});
