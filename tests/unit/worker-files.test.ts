import { afterEach, expect, it, vi } from "vitest";
import anchors from "@/data/seed/anchors.json";
import manifest from "@/data/seed/manifest.json";
import { loadSeed } from "@/lib/seed/load";

vi.mock("node:fs", () => ({ readFileSync: () => { throw new Error("filesystem unavailable in Worker"); } }));
const runtime = globalThis as typeof globalThis & { __demoFiles?: Record<string, string> };
afterEach(() => { delete runtime.__demoFiles; });
it("loads the complete synthetic seed from bundled files without local filesystem access", () => {
  runtime.__demoFiles = {
    "data/seed/anchors.json": JSON.stringify(anchors),
    "data/seed/cohort.json": "[]",
    "data/seed/edge-cases.json": "[]",
    "data/seed/manifest.json": JSON.stringify(manifest),
  };
  const seed = loadSeed();
  expect(seed.anchors).toHaveLength(12);
  expect(seed.anchors.find(p => p.id === "P-A")?.anchorKey).toBe("A");
  expect(seed.manifest.checksum).toBe(manifest.checksum);
});
