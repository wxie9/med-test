import { describe, it, expect, beforeEach } from "vitest";
import { POST, GET } from "@/app/api/candidates/route";
import { PATCH } from "@/app/api/candidates/[id]/route";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
import { getStore, resetStore } from "@/lib/state/store";
import type { CandidateRequest } from "@/lib/domain/types";
const post = (body: unknown) => POST(new Request("http://x/api/candidates", { method: "POST", body: JSON.stringify(body) }));
const patch = (id: string, body: unknown) => PATCH(new Request(`http://x/api/candidates/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
describe("/api/candidates", () => {
  let snapId: string;
  beforeEach(() => { resetStore(); const c = createCohort("m", { hrPositive: true, her2: ["low"], stage: ["metastatic"], priorCdk46: true }, "x"); submitCohort(c.id); snapId = createSnapshot(c.id, "2026-10-13").id; });
  it("POST returns 201 with the count-only pharma view (no patient ids)", async () => {
    const r = await post({ snapshotId: snapId, protocolId: "XX-ADC-301" }); expect(r.status).toBe(201);
    const j = await r.json(); expect(j.total).toBeGreaterThan(0); expect(j.confirmed).toBe(0); expect(j).not.toHaveProperty("candidates");
    const json = JSON.stringify(j); for (const c of getStore().candidateRequests[0].candidates) expect(json).not.toContain(c.patientId);
  });
  it("POST a second time for the same snapshot+protocol returns 409 with the existing summary", async () => {
    const first = await (await post({ snapshotId: snapId, protocolId: "XX-ADC-301" })).json();
    const r = await post({ snapshotId: snapId, protocolId: "XX-ADC-301" }); expect(r.status).toBe(409);
    const j = await r.json(); expect(j).toEqual(first); expect(getStore().candidateRequests).toHaveLength(1);
  });
  it("POST 404 for unknown snapshot, 400 for invalid body", async () => {
    expect((await post({ snapshotId: "nope", protocolId: "XX-ADC-301" })).status).toBe(404);
    expect((await post({ snapshotId: snapId })).status).toBe(400);
  });
  it("GET returns full requests with per-candidate summaries; PATCH confirms and messages the patient", async () => {
    await post({ snapshotId: snapId, protocolId: "XX-ADC-301" });
    const list = (await (await GET()).json()) as (CandidateRequest & { summaries: { patientId: string; her2: string; currentLine: string | null; latestPro: string | null }[] })[];
    expect(list).toHaveLength(1); const req = list[0]; expect(req.summaries).toHaveLength(req.candidates.length);
    const s0 = req.summaries[0]; expect(Object.keys(s0).sort()).toEqual(["currentLine", "her2", "latestPro", "patientId"]);
    expect(s0.patientId).toBe(req.candidates[0].patientId); expect(s0.her2).toBe("HER2-low"); expect(s0.currentLine).toMatch(/^第 \d+ 线/);
    const pid = req.candidates[0].patientId;
    const r = await patch(req.id, { patientId: pid, status: "confirmed", by: "张医生" }); expect(r.status).toBe(200);
    const j = (await r.json()) as CandidateRequest; expect(j.candidates.find(c => c.patientId === pid)?.status).toBe("confirmed");
    expect(getStore().messages.some(m => m.patientId === pid && m.kind === "research_opportunity")).toBe(true);
  });
  it("PATCH 400 for invalid body, 404 for unknown request or candidate", async () => {
    const { id } = await (await post({ snapshotId: snapId, protocolId: "XX-ADC-301" })).json();
    expect((await patch(id, { patientId: "P-0001", status: "maybe", by: "x" })).status).toBe(400);
    expect((await patch(id, { patientId: "P-0001", status: "confirmed" })).status).toBe(400);
    expect((await patch("nope", { patientId: "P-0001", status: "confirmed", by: "x" })).status).toBe(404);
    expect((await patch(id, { patientId: "P-NOPE", status: "confirmed", by: "x" })).status).toBe(404);
  });
});
