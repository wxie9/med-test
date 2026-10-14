import { describe, it, expect, beforeEach } from "vitest";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
import { getStore, resetStore } from "@/lib/state/store";
describe("snapshot", () => {
  beforeEach(() => resetStore());
  it("is immutable against later clinical edits", () => {
    const c = createCohort("HER2低表达转移性", { hrPositive: true, her2: ["low"], stage: ["metastatic"], priorCdk46: true }, "张医生"); submitCohort(c.id);
    const snap = createSnapshot(c.id, "2026-10-13"); const before = JSON.stringify(snap);
    const live = getStore().patients.get(snap.patients[0].id)!; live.treatments.push({ id: "new", type: "chemo", intent: "metastatic", drug: "x", start: "2026-10-14", end: null, stopReason: "ongoing", source: "in_house" });
    expect(JSON.stringify(getStore().snapshots[0])).toBe(before);
  });
  it("excludes patients without pharma consent and strips anchor fields", () => {
    const c = createCohort("all", {}, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    expect(snap.patients.every(p => p.consent.pharmaDeidentified)).toBe(true); expect(snap.patients.every(p => p.anchorKey === null && !p.expertNote)).toBe(true);
  });
  it("snapshot requires submitted cohort", () => { const c = createCohort("d", {}, "x"); expect(() => createSnapshot(c.id, "2026-10-13")).toThrow(); });
  it("excludes biomarkers entered after the cutoff (P-L late-entered metastatic biopsy)", () => {
    const c = createCohort("all", {}, "x"); submitCohort(c.id);
    expect(c.patientIds).toContain("P-L");
    const early = createSnapshot(c.id, "2026-09-01"); const late = createSnapshot(c.id, "2026-10-13");
    expect(early.patients.find(p => p.id === "P-L")!.biomarkers.map(b => b.id)).toEqual(["P-L-b1"]);
    expect(late.patients.find(p => p.id === "P-L")!.biomarkers.map(b => b.id)).toEqual(["P-L-b1", "P-L-b2"]);
    expect(getStore().patients.get("P-L")!.biomarkers).toHaveLength(2);
  });
  it("includes a result entered on the cutoff day, even with a time component", () => {
    const b = getStore().patients.get("P-L")!.biomarkers.find(x => x.id === "P-L-b2")!; b.enteredAt = "2026-09-20T15:30:00Z";
    const c = createCohort("pl", { stage: ["metastatic"] }, "x"); submitCohort(c.id);
    const pl = (cutoff: string) => createSnapshot(c.id, cutoff).patients.find(p => p.biomarkers.some(x => x.id === "P-L-b1"))!;
    expect(pl("2026-09-20").biomarkers.map(x => x.id)).toEqual(["P-L-b1", "P-L-b2"]);
    expect(pl("2026-09-19").biomarkers.map(x => x.id)).toEqual(["P-L-b1"]);
  });
  it("numbers snapshot ids per cutoff with a global version and deep-freezes the snapshot", () => {
    const c = createCohort("d", { stage: ["metastatic"] }, "x"); submitCohort(c.id);
    const a = createSnapshot(c.id, "2026-10-13"); const b = createSnapshot(c.id, "2026-09-01");
    expect(a.id).toBe("SNAP-2026-10-13-v1"); expect(b.id).toBe("SNAP-2026-09-01-v2");
    expect(Object.isFrozen(a)).toBe(true); expect(Object.isFrozen(a.patients[0])).toBe(true); expect(Object.isFrozen(a.patients[0].treatments)).toBe(true);
  });
  it("clips everything at an early cutoff (P-B at 2026-07-01: the T-DXd line vanishes)", () => {
    const c = createCohort("pb", { stage: ["metastatic"] }, "x"); submitCohort(c.id);
    const pb = (cutoff: string) => createSnapshot(c.id, cutoff).patients.find(p => p.treatments.some(t => t.id === "P-B-t1"))!;
    const live = getStore().patients.get("P-B")!;
    const early = pb("2026-07-01");
    expect(early.treatments.map(t => t.id)).not.toContain("P-B-t6");
    expect(early.treatments.some(t => t.type === "adc")).toBe(false);
    expect(early.lines).toHaveLength(1); expect(early.lines[0].eventIds).toEqual(["P-B-t4", "P-B-t5"]);
    expect(early.lines[0].reviewStatus).toBe("confirmed"); // unchanged line keeps its review
    expect(early.pro).toEqual([]); expect(early.lastContact).toBe("2026-07-01");
    expect(early.outcomes.map(o => o.type)).toEqual(["distant_metastasis", "progression"]);
    // ending after the cutoff ⇒ ongoing at the cutoff; the progression after it is not yet known
    const mid = pb("2026-06-01");
    expect(mid.treatments.filter(t => t.intent === "metastatic").every(t => t.end === null && t.stopReason === "ongoing")).toBe(true);
    expect(mid.outcomes.map(o => o.type)).toEqual(["distant_metastasis"]); expect(mid.lines[0].end).toBeNull();
    // full cutoff keeps the live record; the live patient is untouched
    const full = pb("2026-10-13"); expect(full.treatments).toEqual(live.treatments); expect(full.lines).toEqual(live.lines);
    expect(live.treatments.some(t => t.id === "P-B-t6")).toBe(true); expect(live.pro.length).toBeGreaterThan(0);
  });
  it("a death after the cutoff is not yet known (stage falls back to metastatic)", () => {
    const c = createCohort("pj", { stage: ["deceased"] }, "x"); submitCohort(c.id);
    const death = getStore().patients.get("P-J")!.outcomes.find(o => o.type === "death")!.date;
    const before = createSnapshot(c.id, "2025-01-01").patients.find(p => p.treatments.some(t => t.id === "P-J-t1"));
    expect(before).toBeDefined(); expect(death > "2025-01-01").toBe(true);
    expect(before!.stage).toBe("metastatic"); expect(before!.outcomes.some(o => o.type === "death")).toBe(false);
  });
});
