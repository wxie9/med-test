import { expect, it } from "vitest";
import { fingerprintSeed } from "@/scripts/seed-fingerprint";

it("invalidates persisted state for anchor changes even when cohort checksum is unchanged", () => {
  const files = { "data/seed/anchors.json": "anchor-v1", "data/seed/cohort.json": "same-cohort", "data/seed/edge-cases.json": "edges", "data/seed/manifest.json": "same-cohort-checksum", "data/seed/psp.json": "psp", "data/seed/psp-manifest.json": "psp-manifest", "docs/demo-script.md": "script-v1" };
  const original = fingerprintSeed(files);
  expect(fingerprintSeed({ ...files, "data/seed/anchors.json": "anchor-v2" })).not.toBe(original);
  expect(fingerprintSeed({ ...files, "data/seed/psp.json": "changed" })).not.toBe(original);
  expect(fingerprintSeed({ ...files, "docs/demo-script.md": "script-v2" })).toBe(original);
});
