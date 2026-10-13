import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  // This machine's /etc/hosts has no plain "localhost" entry; avoid Vite's localhost DNS lookup.
  server: { host: "127.0.0.1" },
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname) } },
});
