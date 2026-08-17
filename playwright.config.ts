import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start',
        url: `${baseURL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
