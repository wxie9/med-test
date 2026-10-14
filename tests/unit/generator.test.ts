import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { generateCohort, generateEdgeCases, checksumOf } from "@/lib/seed/generator";
import { validatePatients } from "@/lib/seed/validate";
import { Patient } from "@/lib/domain/types";
import { deriveHer2Low } from "@/lib/domain/her2";
import { addDays } from "@/lib/domain/dates";
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
  it("no event after the cutoff; adjuvant anti-HER2 starts with the taxane phase (after 4 cycles AC)", () => {
    const CUT = "2026-10-13";
    for (const p of cohort) {
      for (const t of p.treatments) { expect(t.start === null || t.start <= CUT, `${t.id} start`).toBe(true); expect(t.end === null || t.end <= CUT, `${t.id} end`).toBe(true); }
      expect(p.outcomes.every(o => o.date <= CUT)).toBe(true);
      expect(p.biomarkers.every(b => b.specimenDate <= CUT)).toBe(true);
      const her2 = p.treatments.find(t => t.type === "anti_her2" && t.intent === "adjuvant" && t.start);
      if (her2 && p.surgeryDate) expect(her2.start! >= addDays(p.surgeryDate, 77), `${her2.id} concurrent with AC`).toBe(true);
    }
    // treatments that would have run past the cutoff are ongoing at the cutoff
    expect(cohort.some(p => p.treatments.some(t => t.type === "anti_her2" && t.intent === "adjuvant" && t.stopReason === "ongoing" && t.end === null))).toBe(true);
  });
  it("weekly treatment PROs begin no earlier than active therapy, including P-0579", () => {
    const p579 = cohort.find(p => p.id === "P-0579")!;
    const therapy = p579.treatments.find(t => t.intent === "metastatic" && t.start && !t.end)!;
    expect(therapy).toBeDefined();
    expect(p579.pro.every(r => r.scaleId !== "treatment_weekly_v1" || r.submittedAt.slice(0, 10) >= therapy.start!)).toBe(true);
    for (const p of cohort) {
      const active = p.treatments.find(t => t.intent === "metastatic" && t.start && !t.end);
      for (const r of p.pro.filter(r => r.scaleId === "treatment_weekly_v1")) {
        expect(active && r.submittedAt.slice(0, 10) >= active.start!, `${r.id} predates therapy`).toBe(true);
      }
    }
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

describe("validator: cutoff rules (purpose-built violations)", () => {
  const base = (): Patient => structuredClone(Patient.array().parse(JSON.parse(readFileSync("data/seed/anchors.json", "utf8"))).find(p => p.id === "P-B")!);
  const CUT = "2026-10-13";
  it("the untouched anchor is clean at the default cutoff and the default is 2026-10-13", () => {
    expect(validatePatients([base()])).toEqual([]);
    expect(validatePatients([base()], CUT)).toEqual([]);
  });
  it("flags a treatment starting after the cutoff", () => {
    const p = base(); p.treatments.push({ ...p.treatments[1], id: "late-start", start: "2026-10-20", end: null, intent: "metastatic", stopReason: "ongoing" });
    expect(validatePatients([p], CUT).some(e => e.includes("late-start treatment date 2026-10-20 after cutoff"))).toBe(true);
  });
  it("flags a treatment ending after the cutoff", () => {
    const p = base(); p.treatments.find(t => t.id === "P-B-t6")!.end = "2026-11-01";
    expect(validatePatients([p], CUT).some(e => e.includes("P-B-t6 treatment date 2026-11-01 after cutoff"))).toBe(true);
  });
  it("flags an outcome, a PRO, an adherence log and a biomarker after the cutoff", () => {
    const p = base();
    p.outcomes.push({ id: "late-o", type: "progression", date: "2026-10-14", evidence: "imaging", assessor: "x" });
    p.pro.push({ ...p.pro[0], id: "late-pro", submittedAt: "2026-10-14T09:00:00+08:00" });
    p.adherence.push({ date: "2026-10-15", due: 1, taken: 1, missedReason: null });
    p.biomarkers.push({ ...p.biomarkers[0], id: "late-b", specimenDate: "2026-10-16" });
    const errs = validatePatients([p], CUT);
    expect(errs.some(e => e.includes("late-o outcome after cutoff"))).toBe(true);
    expect(errs.some(e => e.includes("late-pro PRO after cutoff"))).toBe(true);
    expect(errs.some(e => e.includes("adherence 2026-10-15 after cutoff"))).toBe(true);
    expect(errs.some(e => e.includes("late-b biomarker after cutoff"))).toBe(true);
  });
  it("a later cutoff accepts the same dates", () => {
    const p = base(); p.outcomes.push({ id: "late-o", type: "progression", date: "2026-10-14", evidence: "imaging", assessor: "x" });
    expect(validatePatients([p], "2026-12-31")).toEqual([]);
  });
  it("independently rejects weekly PRO before therapy and accepts one at therapy start", () => {
    const p = base();
    p.pro = [{ ...p.pro[0], id: "before-therapy", scaleId: "treatment_weekly_v1", submittedAt: "2025-04-01T09:00:00+08:00", flags: {} }];
    expect(validatePatients([p]).some(e => e.includes("before-therapy PRO outside dated metastatic treatment"))).toBe(true);
    p.pro[0].submittedAt = "2025-04-15T09:00:00+08:00";
    expect(validatePatients([p])).toEqual([]);
  });
  it("rejects weekly PRO without a dated applicable therapy", () => {
    const p = base();
    p.treatments = p.treatments.filter(t => t.intent !== "metastatic");
    expect(validatePatients([p]).some(e => e.includes("PRO outside dated metastatic treatment"))).toBe(true);
  });
  it("accepts a UTC weekly timestamp on the Shanghai therapy-start day", () => {
    const p = base();
    p.pro = [{ ...p.pro[0], id: "shanghai-start", scaleId: "treatment_weekly_v1", submittedAt: "2025-04-14T16:30:00Z", flags: {} }];
    expect(validatePatients([p])).toEqual([]);
  });
  it("rejects a UTC weekly timestamp after the Shanghai therapy-end day", () => {
    const p = base();
    p.pro = [{ ...p.pro[0], id: "shanghai-after-end", scaleId: "treatment_weekly_v1", submittedAt: "2026-06-30T16:30:00Z", flags: {} }];
    expect(validatePatients([p])).toContain("P-B:shanghai-after-end PRO outside dated metastatic treatment");
    p.pro[0].submittedAt = "2026-06-30T15:30:00Z";
    expect(validatePatients([p])).toEqual([]);
  });
  it("uses the Shanghai submission day for the cutoff boundary", () => {
    const p = base();
    p.pro = [{ ...p.pro[0], id: "shanghai-cutoff", scaleId: "treatment_weekly_v1", submittedAt: "2026-10-13T16:30:00Z", flags: {} }];
    expect(validatePatients([p], CUT)).toContain("P-B:shanghai-cutoff PRO after cutoff");
    p.pro[0].submittedAt = "2026-10-13T15:30:00Z";
    expect(validatePatients([p], CUT)).toEqual([]);
  });
  it("uses the Shanghai submission day for the death boundary", () => {
    const p = structuredClone(Patient.array().parse(JSON.parse(readFileSync("data/seed/anchors.json", "utf8"))).find(p => p.id === "P-J")!);
    p.pro = [{ id: "shanghai-death", scaleId: "endocrine_monthly_v1", submittedAt: "2025-05-22T16:30:00Z", items: {}, flags: {} }];
    expect(validatePatients([p])).toContain("P-J PRO after death");
    p.pro[0].submittedAt = "2025-05-22T15:30:00Z";
    expect(validatePatients([p])).toEqual([]);
  });
});
