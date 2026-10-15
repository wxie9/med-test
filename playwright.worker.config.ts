import { defineConfig } from '@playwright/test';
import config from './playwright.config';
export default defineConfig({
  ...config,
  outputDir: 'test-results/worker',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/worker', open: 'never' }]],
  projects: [{ name: 'worker', metadata: { backend: 'worker' } }],
  use: { ...config.use, baseURL: 'http://127.0.0.1:8787' },
  webServer: { command: 'node scripts/e2e-runtime.mjs worker', url: 'http://127.0.0.1:8787/api/state', reuseExistingServer: false, gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 }, timeout: 120_000 },
});
