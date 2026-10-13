import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3000", viewport: { width: 1920, height: 1080 } },
  webServer: { command: "npm run demo", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 120_000 },
});
