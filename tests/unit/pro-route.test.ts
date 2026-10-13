import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { submitPro } from "@/lib/pro/submit";
import { getStore, resetStore } from "@/lib/state/store";
describe("submitPro", () => {
  beforeEach(() => resetStore());
  afterEach(() => { delete process.env.DEMO_FIXED_NOW; });
  it("creates exactly two alerts for patient A story input", () => {
    const r = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 2, 潮热: 2, 情绪: 1, 睡眠: 1 }, flags: { missedDoses14d: 5, stopIntent: true } });
    expect(r.alerts).toHaveLength(2); expect(getStore().alerts).toHaveLength(2); expect(getStore().alerts[0].status).toBe("unassigned");
    expect(getStore().patients.get("P-A")!.pro.at(-1)!.id).toBe(r.proId);
  });
  it("off-hours high alert adds emergency message", () => {
    process.env.DEMO_FIXED_NOW = "2026-10-13T21:00:00+08:00";
    const r = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 3 }, flags: {} });
    expect(r.offHours).toBe(true); expect(r.emergency).toBe(true); expect(getStore().messages.some(m => m.kind === "emergency")).toBe(true);
  });
  it("daytime submit returns the 1-working-day feedback and stores an alert_feedback message", () => {
    process.env.DEMO_FIXED_NOW = "2026-10-13T10:00:00+08:00";
    const r = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 3 }, flags: {} });
    expect(r.offHours).toBe(false); expect(r.emergency).toBe(false);
    expect(r.feedback).toContain("个案管理师将在 1 个工作日内联系您");
    expect(getStore().messages.map(m => m.kind)).toEqual(["alert_feedback"]);
  });
  it("off-hours medium-only alert is not an emergency", () => {
    process.env.DEMO_FIXED_NOW = "2026-10-13T21:00:00+08:00";
    const r = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 2 }, flags: {} });
    expect(r.offHours).toBe(true); expect(r.emergency).toBe(false); expect(getStore().messages.map(m => m.kind)).toEqual(["alert_feedback"]);
  });
  it("rejects unknown patient", () => expect(() => submitPro({ patientId: "nope", scaleId: "endocrine_monthly_v1", items: {}, flags: {} })).toThrow());
});
