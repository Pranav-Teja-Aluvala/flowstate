import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  reporter: 'list',
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000/login',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:collaboration',
      url: 'http://localhost:1234',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
