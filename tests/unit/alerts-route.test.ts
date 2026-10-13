import { describe, it, expect, beforeEach } from "vitest";
import { PATCH } from "@/app/api/alerts/[id]/route";
import { submitPro } from "@/lib/pro/submit";
import { actOnAlert } from "@/lib/clinic/actions";
import { getStore, resetStore } from "@/lib/state/store";
const call = (id: string, body: object) => PATCH(new Request(`http://x/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const task = { type: "复评", due: "2026-10-27", owner: "个案管理师小陈" };
describe("PATCH /api/alerts/:id", () => {
  let id = "";
  beforeEach(() => {
    resetStore();
    id = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 3 }, flags: {} }).alerts[0].id;
    for (const a of ["accept", "start", "submit_review"] as const) actOnAlert(id, a, "个案管理师小陈", a === "submit_review" ? "已沟通，建议复评" : undefined);
  });
  it("rejects close with an empty note or without a task (400, nothing written)", async () => {
    expect((await call(id, { action: "close", by: "张医生", note: "  ", task })).status).toBe(400);
    expect((await call(id, { action: "close", by: "张医生", note: "已处理" })).status).toBe(400);
    expect(getStore().alerts[0].status).toBe("pending_review"); expect(getStore().tasks).toHaveLength(0);
  });
  it("closes with note + task and messages the patient", async () => {
    const r = await call(id, { action: "close", by: "张医生", note: "已处理", task });
    expect(r.status).toBe(200); expect(getStore().alerts[0].status).toBe("closed");
    expect(getStore().messages.at(-1)!.text).toContain("医生已处理您的报告：已处理");
  });
  it("开始处置 note is optional, 提交复核 note is required; both notes are recorded on the alert", async () => {
    resetStore();
    const a = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 3 }, flags: {} }).alerts[0].id;
    expect((await call(a, { action: "accept", by: "个案管理师小陈" })).status).toBe(200);
    expect((await call(a, { action: "start", by: "个案管理师小陈" })).status).toBe(200);
    expect((await call(a, { action: "submit_review", by: "个案管理师小陈" })).status).toBe(400);
    expect((await call(a, { action: "submit_review", by: "个案管理师小陈", note: "   " })).status).toBe(400);
    expect(getStore().alerts[0].status).toBe("in_progress");
    expect((await call(a, { action: "submit_review", by: "个案管理师小陈", note: "已沟通，建议复评" })).status).toBe(200);
    expect(getStore().alerts[0].notes.map(n => n.text)).toEqual(["已沟通，建议复评"]);
    resetStore();
    const b = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 3 }, flags: {} }).alerts[0].id;
    await call(b, { action: "accept", by: "x" }); await call(b, { action: "start", by: "x", note: "电话沟通：关节痛导致漏服" });
    expect(getStore().alerts[0].notes.map(n => n.text)).toEqual(["电话沟通：关节痛导致漏服"]);
    expect(() => actOnAlert(b, "submit_review", "x")).toThrow("提交复核需填写处置记录");
  });
  it("illegal transition → 400 with the error message", async () => {
    const r = await call(id, { action: "accept", by: "x" });
    expect(r.status).toBe(400); expect(((await r.json()) as { error: string }).error).toBe("invalid transition");
  });
});
