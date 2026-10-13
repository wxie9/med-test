import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { generateCohort, generateEdgeCases, checksumOf } from "@/lib/seed/generator";
import { validatePatients } from "@/lib/seed/validate";
import { Patient } from "@/lib/domain/types";
import { deriveHer2Low } from "@/lib/domain/her2";
const cohort = generateCohort({ seed: 20261013, n: 2000, cutoff: "2026-10-13" });
const share = (f: (p: Patient) => boolean) => cohort.filter(f).length / cohort.length;
const isOngoing = (t: Patient["treatments"][number]) => t.stopReason === "ongoing" || (t.start !== null && t.end === null);
const chemoOverlapsEndocrine = (p: Patient) => {
  const span = (t: Patient["treatments"][number]) => [t.start!, t.end ?? "9999-12-31"] as const;
  const chemo = p.treatments.filter(t => t.type === "chemo" && t.start), endo = p.treatments.filter(t => t.type === "endocrine" && t.start);
  return chemo.some(c => endo.some(e => span(c)[0] < span(e)[1] && span(e)[0] < span(c)[1]));
};
describe("generator", () => {
  it("is deterministic", () => {
    const a = generateCohort({ seed: 20261013, n: 200, cutoff: "2026-10-13" });
    const b = generateCohort({ seed: 20261013, n: 200, cutoff: "2026-10-13" });
    expect(checksumOf(a)).toBe(checksumOf(b));
  });
  it("has zero hard-constraint violations", () => {
    expect(validatePatients(cohort)).toEqual([]);
  });
  it("subtype distribution is near target", () => {
    const her2PosShare = share(p => p.biomarkers[0].her2Ihc === "3+");
    expect(her2PosShare).toBeGreaterThan(0.15); expect(her2PosShare).toBeLessThan(0.25);
  });
  it("HER2-low is about half of non-HER2+ patients", () => {
    const nonPos = cohort.filter(p => p.biomarkers[0].her2Ihc !== "3+");
    const low = nonPos.filter(p => deriveHer2Low(p.biomarkers[0]) === "low").length / nonPos.length;
    expect(low).toBeGreaterThan(0.40); expect(low).toBeLessThan(0.60);
  });
  it("imperfection rates are near target", () => {
    const unknownStop = share(p => p.treatments.some(t => t.stopReason === "unknown"));
    expect(unknownStop).toBeGreaterThan(0.05); expect(unknownStop).toBeLessThan(0.12);
    const externalNoDate = share(p => p.treatments.some(t => t.source === "external" && t.start === null));
    expect(externalNoDate).toBeGreaterThan(0.06); expect(externalNoDate).toBeLessThan(0.14);
  });
  it("is clinically coherent", () => {
    expect(cohort.filter(p => p.stage === "survivorship" && p.treatments.some(t => t.type === "endocrine" && isOngoing(t))).length).toBe(0);
    expect(cohort.filter(p => p.stage === "lost" && p.lastContact < p.enrolledAt).length).toBe(0);
    expect(cohort.filter(chemoOverlapsEndocrine).length).toBe(0);
  });
  it("anchors parse and pass hard constraints", () => {
    const anchors = Patient.array().parse(JSON.parse(readFileSync("data/seed/anchors.json", "utf8")));
    expect(anchors).toHaveLength(12);
    expect(validatePatients(anchors)).toEqual([]);
  });
  it("edge cases DO violate constraints, every one of them", () => {
    const edge = generateEdgeCases(); const errs = validatePatients(edge);
    expect(errs.length).toBeGreaterThan(0);
    for (const p of edge) expect(errs.some(e => e.startsWith(`${p.id}:`) || e.startsWith(`${p.id} `))).toBe(true);
  });
});
