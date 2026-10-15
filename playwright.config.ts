import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', timeout: 60_000, retries: 0, workers: 1, fullyParallel: false,
  globalSetup: './tests/e2e/helpers/runtimeSetup.ts',
  outputDir: 'test-results/next',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/next', open: 'never' }]],
  projects: [{ name: 'next', metadata: { backend: 'next' } }],
  use: { baseURL: 'http://127.0.0.1:3112', viewport: { width: 1920, height: 1080 }, trace: 'on' },
  webServer: { command: 'node scripts/e2e-runtime.mjs next', url: 'http://127.0.0.1:3112/api/state', reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 }, timeout: 120_000 },
});
