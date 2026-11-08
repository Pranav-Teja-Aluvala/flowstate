import { defineConfig } from '@playwright/test';
const liveRunner = process.env.FLOWSTATE_LIVE_RUNNER === '1';
const fixtureEnvironment = {
  RUNNER_ENABLED: 'true',
  GITHUB_TOKEN_KEY: '1'.repeat(64),
  COLLABORATION_SECRET: 'flowstate_code_fixture_signing_secret_at_least_32_characters',
  APP_URL: 'http://localhost:3001',
  ALLOWED_ORIGINS: 'http://localhost:3001',
  COLLABORATION_PORT: '1238',
  RUNNER_INTERNAL_URL: liveRunner ? 'http://127.0.0.1:1236' : 'http://127.0.0.1:65530',
  COLLABORATION_INTERNAL_URL: 'ws://127.0.0.1:1238',
};
export default defineConfig({
  outputDir: './code-test-results',
  testDir: './tests/code-e2e',
  workers: 1,
  timeout: liveRunner ? 120_000 : 60_000,
  use: { baseURL: 'http://localhost:3001', trace: 'retain-on-failure' },
  reporter: 'list',
  webServer: [
    {
      command:
        'node --import ./tests/support/mock-github.mjs ./node_modules/next/dist/bin/next start apps/web -p 3001',
      url: 'http://localhost:3001/login',
      timeout: 60_000,
      env: fixtureEnvironment,
    },
    {
      command:
        'node --import ./tests/support/mock-github.mjs --import tsx apps/collaboration/src/index.ts',
      url: 'http://localhost:1238',
      timeout: 30_000,
      env: fixtureEnvironment,
    },
    ...(liveRunner
      ? [
          {
            command:
              'node --import ./tests/support/mock-github.mjs --import tsx apps/runner/src/index.ts',
            url: 'http://127.0.0.1:1236/health',
            timeout: 30_000,
            env: fixtureEnvironment,
          },
        ]
      : []),
  ],
});
