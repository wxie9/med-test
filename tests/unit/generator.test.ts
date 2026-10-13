import { describe, it, expect } from "vitest";
import { generateCohort, generateEdgeCases, checksumOf } from "@/lib/seed/generator";
import { validatePatients } from "@/lib/seed/validate";
describe("generator", () => {
  it("is deterministic", () => {
    const a = generateCohort({ seed: 20261013, n: 200, cutoff: "2026-10-13" });
    const b = generateCohort({ seed: 20261013, n: 200, cutoff: "2026-10-13" });
    expect(checksumOf(a)).toBe(checksumOf(b));
  });
  it("has zero hard-constraint violations", () => {
    const ps = generateCohort({ seed: 20261013, n: 2000, cutoff: "2026-10-13" });
    expect(validatePatients(ps)).toEqual([]);
  });
  it("subtype distribution is near target", () => {
    const ps = generateCohort({ seed: 20261013, n: 2000, cutoff: "2026-10-13" });
    const hrNeg = ps.filter(p => p.biomarkers[0].her2Ihc === "3+").length / ps.length;
    expect(hrNeg).toBeGreaterThan(0.15); expect(hrNeg).toBeLessThan(0.25);
  });
  it("edge cases DO violate constraints", () => {
    expect(validatePatients(generateEdgeCases()).length).toBeGreaterThan(0);
  });
});
