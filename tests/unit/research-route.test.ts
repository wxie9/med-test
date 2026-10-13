import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
import { researchUseCase } from "@/lib/research/usecases";
import { getStore, resetStore } from "@/lib/state/store";
import expected from "@/data/seed/expected.json";
import type { CohortFilter } from "@/lib/domain/types";
describe("research use cases", () => {
  let snapId: string;
  beforeEach(() => { resetStore(); const c = createCohort("m", { stage: ["metastatic", "deceased"] }, "x"); submitCohort(c.id); snapId = createSnapshot(c.id, "2026-10-13").id; });
  it("overview counts match snapshot", () => { const o = researchUseCase("overview", snapId); expect(o.n).toBeGreaterThan(0); expect(o.events.metastasis).toBe(o.n); });
  it("feasibility funnel steps are exhaustive per step", () => { const f = researchUseCase("feasibility", snapId); for (const s of f.steps) expect(s.met + s.notMet + s.unknown).toBeGreaterThan(0); });
  it("unknown snapshot throws", () => expect(() => researchUseCase("overview", "nope")).toThrow());
  it("overview with <10 deaths marks survival as not estimable", () => { const o = researchUseCase("overview", snapId); expect(typeof o.survivalEstimable).toBe("boolean"); });
});
describe("GET /api/research/:useCase", () => {
  let snapId: string;
  beforeEach(() => { resetStore(); const c = createCohort("m", { stage: ["metastatic"] }, "x"); submitCohort(c.id); snapId = createSnapshot(c.id, "2026-10-13").id; });
  const get = async (useCase: string, qs: string) => {
    const { GET } = await import("@/app/api/research/[useCase]/route");
    return GET(new NextRequest(`http://x/api/research/${useCase}${qs}`), { params: Promise.resolve({ useCase }) });
  };
  it("returns the use case JSON (counts only for feasibility)", async () => {
    const r = await get("feasibility", `?snapshotId=${snapId}`); expect(r.status).toBe(200);
    const j = await r.json(); expect(j.steps).toHaveLength(6); expect(j.finalMetCount).toBeGreaterThan(0);
    expect(j.pendingVerification).toEqual([{ criterionId: "ecog", label: expect.any(String), count: j.finalMetCount }]);
  });
  it("400 for unknown use case or missing snapshotId", async () => { expect((await get("survival", `?snapshotId=${snapId}`)).status).toBe(400); expect((await get("overview", "")).status).toBe(400); });
  it("404 for unknown snapshot", async () => expect((await get("overview", "?snapshotId=nope")).status).toBe(404));
});
describe("research summaries, de-identification and survival threshold", () => {
  let snapId: string;
  beforeEach(() => { resetStore(); const c = createCohort("m", { stage: ["metastatic", "deceased"] }, "x"); submitCohort(c.id); snapId = createSnapshot(c.id, "2026-10-13").id; });
  it("every use case carries a summary with n, events, followUpMedian and cutoff", () => {
    const o = researchUseCase("overview", snapId);
    const snap = getStore().snapshots.find(s => s.id === snapId)!;
    const withEvent = snap.patients.filter(p => p.outcomes.some(e => e.type === "distant_metastasis" || e.type === "progression" || e.type === "death")).length;
    expect(o.summary).toEqual({ n: o.n, events: withEvent, followUpMedian: o.followUpMonths.median, cutoff: "2026-10-13" });
    expect(o.summary.events).toBeLessThanOrEqual(o.summary.n);
    const p = researchUseCase("patterns", snapId);
    expect(p.summary.n).toBe(p.patterns.n); expect(p.summary.events).toBeGreaterThan(0); expect(p.summary.followUpMedian).toBeGreaterThan(0); expect(p.summary.cutoff).toBe("2026-10-13");
    const f = researchUseCase("feasibility", snapId);
    expect(f.summary.n).toBe(o.n); expect(f.summary.events).toBeNull(); expect(f.summary.cutoff).toBe("2026-10-13");
    const a = researchUseCase("adherence", snapId);
    expect(a.summary).toEqual({ n: a.n, events: null, followUpMedian: null, cutoff: "2026-10-13" });
  });
  it("feasibility exposes counts only, never patient ids", () => {
    const f = researchUseCase("feasibility", snapId); const json = JSON.stringify(f);
    expect(f).not.toHaveProperty("finalMet"); expect(f).not.toHaveProperty("finalUnknown");
    expect(json).not.toContain("patientIds"); expect(json).not.toMatch(/"P-[0-9A-Z]+"/);
    expect(f.finalMetCount + f.finalUnknownCount).toBeGreaterThan(0);
  });
  it("survival is estimable with >= 10 deaths and not with fewer", () => {
    resetStore(); const c = createCohort("d", { stage: ["deceased"] }, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    const many = researchUseCase("overview", snap.id); expect(many.events.death).toBeGreaterThanOrEqual(10); expect(many.survivalEstimable).toBe(true);
    const dead = snap.patients.filter(p => p.outcomes.some(o => o.type === "death"));
    getStore().snapshots.push({ ...snap, id: "SNAP-FEW", patients: dead.slice(0, 9) });
    const few = researchUseCase("overview", "SNAP-FEW"); expect(few.events.death).toBe(9); expect(few.survivalEstimable).toBe(false);
  });
});
describe("scripted second snapshot (early_endocrine_ongoing)", () => {
  it("has adherence data and discontinuation reasons", () => {
    resetStore(); const e = expected.find(x => x.key === "early_endocrine_ongoing")!;
    const c = createCohort("early", e.filter as CohortFilter, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    const a = researchUseCase("adherence", snap.id);
    expect(a.n).toBeGreaterThan(0); expect(a.summary.n).toBe(a.n);
    expect(Object.values(a.stopReasonDist).reduce((x, y) => x + y, 0)).toBeGreaterThan(0);
    expect(Object.keys(a.stopReasonDist).every(k => !["completed", "ongoing"].includes(k))).toBe(true);
  });
});
describe("scripted demo cohort (hrpos_evermet_cdk46)", () => {
  it("keeps deceased patients (survival estimable) and shows real 信息不足 at the HER2-low step", () => {
    resetStore(); const e = expected.find(x => x.key === "hrpos_evermet_cdk46")!;
    const c = createCohort("demo", e.filter as CohortFilter, "x"); submitCohort(c.id); expect(c.patientIds).toHaveLength(e.expectedCount!);
    const snap = createSnapshot(c.id, "2026-10-13");
    const o = researchUseCase("overview", snap.id); expect(o.events.death).toBeGreaterThanOrEqual(10); expect(o.survivalEstimable).toBe(true);
    const f = researchUseCase("feasibility", snap.id); const her2 = f.steps.find(s => s.id === "her2_low")!;
    expect(her2.unknown).toBeGreaterThan(0); expect(her2.notMet).toBeGreaterThan(0); expect(her2.unknownReasons["IHC 2+ 缺 ISH 或结果未知"]).toBe(her2.unknown);
  });
});
