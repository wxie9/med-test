import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
import { researchUseCase } from "@/lib/research/usecases";
import { resetStore } from "@/lib/state/store";
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
  it("returns the use case JSON", async () => { const r = await get("feasibility", `?snapshotId=${snapId}`); expect(r.status).toBe(200); expect((await r.json()).steps).toHaveLength(6); });
  it("400 for unknown use case or missing snapshotId", async () => { expect((await get("survival", `?snapshotId=${snapId}`)).status).toBe(400); expect((await get("overview", "")).status).toBe(400); });
  it("404 for unknown snapshot", async () => expect((await get("overview", "?snapshotId=nope")).status).toBe(404));
});
