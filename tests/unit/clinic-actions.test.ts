import { describe, it, expect, beforeEach } from "vitest";
import { submitPro } from "@/lib/pro/submit";
import { actOnAlert, closeAlertWithTask } from "@/lib/clinic/actions";
import { getStore, resetStore } from "@/lib/state/store";
describe("clinic actions", () => {
  beforeEach(() => resetStore());
  it("full loop writes feedback message to patient", () => {
    const { alerts } = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 2 }, flags: { missedDoses14d: 5 } });
    const id = alerts[1].id;
    actOnAlert(id, "accept", "个案管理师小陈"); actOnAlert(id, "start", "个案管理师小陈", "电话沟通：关节痛导致漏服"); actOnAlert(id, "submit_review", "个案管理师小陈", "已沟通，建议复评");
    const r = closeAlertWithTask(id, "张医生", "建议加用对症处理，2 周后复评", { type: "复评", due: "2026-10-27", owner: "个案管理师小陈" });
    expect(r.alert.status).toBe("closed"); expect(getStore().tasks).toHaveLength(1); expect(getStore().messages.at(-1)!.kind).toBe("plan_update");
  });
  it("invalid action returns error, state unchanged", () => {
    const { alerts } = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 3 }, flags: {} });
    expect(() => actOnAlert(alerts[0].id, "close", "x")).toThrow(); expect(getStore().alerts[0].status).toBe("unassigned");
  });
});
