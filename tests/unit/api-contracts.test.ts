import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as proPost } from "@/app/api/pro/route";
import { POST as snapshotPost } from "@/app/api/snapshots/route";
import { POST as taskPost } from "@/app/api/tasks/route";
import { POST as candidatePost } from "@/app/api/candidates/route";
import { PATCH as alertPatch } from "@/app/api/alerts/[id]/route";
import { GET as stateGet } from "@/app/api/state/route";
import { NextRequest } from "next/server";
import { createCohort, submitCohort } from "@/lib/governance/snapshot";
import { getStore, resetStore } from "@/lib/state/store";
import { now, today } from "@/lib/state/clock";
import { recordAdherence } from "@/lib/adherence/checkin";
import { submitPro } from "@/lib/pro/submit";
import { actOnAlert } from "@/lib/clinic/actions";

const request = (path: string, body: unknown) => new Request(`http://demo${path}`, { method: "POST", body: JSON.stringify(body) });
const monthly = { patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 2, 潮热: 2, 情绪: 0, 睡眠: 0 }, flags: { missedDoses14d: 5, stopIntent: true } };
describe("API data contracts", () => {
  beforeEach(() => { process.env.DEMO_FIXED_NOW = "2026-10-13T10:00:00+08:00"; resetStore(); });
  afterEach(() => { delete process.env.DEMO_FIXED_NOW; });

  it.each([{}, { 关节痛: 2 }, { ...monthly.items, 不存在的症状: 3 }])("rejects incomplete or unknown monthly symptom keys without mutation: %j", async items => {
    const n = getStore().patients.get("P-A")!.pro.length;
    expect((await proPost(request("/api/pro", { ...monthly, items }))).status).toBe(400);
    expect(getStore().patients.get("P-A")!.pro).toHaveLength(n);
    expect(getStore().alerts).toHaveLength(0);
  });
  it.each([-1, 15, 999, 1.5])("rejects impossible fourteen-day missed dose count %s", async missedDoses14d => {
    expect((await proPost(request("/api/pro", { ...monthly, flags: { missedDoses14d } }))).status).toBe(400);
  });
  it("rejects endocrine adherence flags on the weekly scale", async () => {
    expect((await proPost(request("/api/pro", { patientId: "P-B", scaleId: "treatment_weekly_v1", items: { 恶心: 2, 乏力: 2, 口腔炎: 1, 腹泻: 0, 手足综合征: 0, 发热: 0 }, flags: { stopIntent: true } }))).status).toBe(400);
  });
  it("accepts both complete scales and creates the expected two monthly alerts", async () => {
    expect((await proPost(request("/api/pro", monthly))).status).toBe(200);
    expect(getStore().alerts).toHaveLength(2);
    expect((await proPost(request("/api/pro", { patientId: "P-B", scaleId: "treatment_weekly_v1", items: { 恶心: 0, 乏力: 0, 口腔炎: 0, 腹泻: 0, 手足综合征: 0, 发热: 0 }, flags: {} }))).status).toBe(200);
  });
  it.each(["2026-02-31", "2026-99-99", "2026-02-29", "2026-00-10"])("rejects invalid snapshot/task dates without mutation: %s", async date => {
    const c = createCohort("all", {}, "review"); submitCohort(c.id);
    expect((await snapshotPost(request("/api/snapshots", { cohortId: c.id, cutoff: date }))).status).toBe(400);
    expect((await taskPost(request("/api/tasks", { patientId: "P-A", type: "复评", owner: "张医生", due: date }))).status).toBe(400);
    expect(getStore().snapshots).toHaveLength(0); expect(getStore().tasks).toHaveLength(0);
  });
  it("accepts a real leap day", async () => {
    const r = await taskPost(request("/api/tasks", { patientId: "P-A", type: "复评", owner: "张医生", due: "2024-02-29" }));
    expect(r.status).toBe(200);
  });
  it("rejects an unsupported research protocol without creating a request", async () => {
    const c = createCohort("all", {}, "review"); submitCohort(c.id);
    const snap = await snapshotPost(request("/api/snapshots", { cohortId: c.id, cutoff: "2026-10-13" }));
    const { id } = await snap.json();
    expect((await candidatePost(request("/api/candidates", { snapshotId: id, protocolId: "UNSUPPORTED-TRIAL" }))).status).toBe(400);
    expect(getStore().candidateRequests).toHaveLength(0);
  });
  it("invalid follow-up date cannot close an alert", async () => {
    const a = submitPro({ ...monthly, scaleId: "endocrine_monthly_v1" }).alerts[0];
    for (const action of ["accept", "start", "submit_review"] as const) actOnAlert(a.id, action, "张医生", "已沟通");
    const r = await alertPatch(request(`/api/alerts/${a.id}`, { action: "close", by: "张医生", note: "已处理", task: { type: "复评", owner: "张医生", due: "2026-02-31" } }), { params: Promise.resolve({ id: a.id }) });
    expect(r.status).toBe(400); expect(getStore().alerts[0].status).toBe("pending_review"); expect(getStore().tasks).toHaveLength(0);
  });
  it("Shanghai midnight uses the new local date for check-in and state deadlines", async () => {
    process.env.DEMO_FIXED_NOW = "2026-10-14T01:00:00+08:00";
    expect(now()).toBe("2026-10-13T17:00:00.000Z"); expect(today()).toBe("2026-10-14");
    expect(recordAdherence({ patientId: "P-A", taken: 1 }).date).toBe("2026-10-14");
    const r = await stateGet(new NextRequest("http://demo/api/state"));
    expect((await r.json()).serverToday).toBe("2026-10-14");
  });
});
