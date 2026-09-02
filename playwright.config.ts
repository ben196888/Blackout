import { defineConfig } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8080';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: {
    timeout: 10_000,
    // Font hinting and antialiasing still differ slightly between a CI runner and the
    // container that wrote the baseline, so allow a thin ratio of changed pixels.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', scale: 'css' },
  },
  // Baselines are Linux-only (see screenshots.spec.ts), so no platform suffix.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  // On CI the HTML report is what makes a screenshot diff reviewable after the fact.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start',
        url: `${baseURL}/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // Fixed deal so the screenshot baselines stay comparable run to run.
        env: { BLACKOUT_SEED: process.env.BLACKOUT_SEED ?? 'blackout-screenshots' },
      },
});
