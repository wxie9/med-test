import { defineConfig } from "@playwright/test";
// One shared dev server holds in-memory demo state, so specs run serially in a single worker.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3000", viewport: { width: 1920, height: 1080 } },
  webServer: {
    command: "npm run demo",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    env: { ...process.env, DEMO_FIXED_NOW: "2026-10-13T10:00:00+08:00" } as Record<string, string>,
  },
});
