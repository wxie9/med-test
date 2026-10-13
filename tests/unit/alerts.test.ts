import { describe, it, expect } from "vitest";
import { evaluatePro } from "@/lib/alerts/rules";
import { transition, checkEscalations } from "@/lib/alerts/machine";
import { getStore } from "@/lib/state/store";
import type { ProResponse } from "@/lib/domain/types";
const pro = (items: Record<string, number>, flags: ProResponse["flags"] = {}) => ({ id: "pro-x", scaleId: "endocrine_monthly_v1" as const, submittedAt: "2026-10-13T09:00:00+08:00", items, flags });
describe("rules", () => {
  const p = getStore().patients.get("P-A")!;
  it("symptom 2 → medium, missed 5 → high adherence", () => {
    const r = evaluatePro(p, pro({ 关节痛: 2, 潮热: 2 }, { missedDoses14d: 5, stopIntent: true }));
    expect(r.map(a => [a.kind, a.level])).toEqual([["symptom", "medium"], ["adherence", "high"]]);
  });
  it("symptom 3 → high", () => expect(evaluatePro(p, pro({ 关节痛: 3 }))[0].level).toBe("high"));
  it("all zero → no alert", () => expect(evaluatePro(p, pro({ 关节痛: 0, 潮热: 0 }))).toHaveLength(0));
});
describe("machine", () => {
  const base = { id: "a1", patientId: "P-A", kind: "symptom" as const, level: "high" as const, rule: "r", status: "triggered" as const, assignee: null, timestamps: { triggered: "2026-10-13T01:00:00Z" }, notes: [], proId: "p" };
  it("happy path", () => {
    let a = transition(base, "assign", "sys", "t1"); a = transition(a, "accept", "nurse", "t2"); a = transition(a, "start", "nurse", "t3", "已电话沟通"); a = transition(a, "submit_review", "nurse", "t4"); a = transition(a, "close", "doctor", "t5", "随访 2 周后复评");
    expect(a.status).toBe("closed"); expect(a.notes).toHaveLength(2);
  });
  it("close without review is invalid", () => expect(() => transition(base, "close", "x", "t")).toThrow("invalid transition"));
  it("high unassigned 3h → escalated; medium 3h → not", () => {
    const hi = transition(base, "assign", "sys", "2026-10-13T01:00:00Z"); const med = { ...hi, id: "a2", level: "medium" as const };
    const out = checkEscalations([hi, med], "2026-10-13T04:00:00Z");
    expect(out.find(a => a.id === "a1")!.status).toBe("escalated"); expect(out.find(a => a.id === "a2")!.status).toBe("unassigned");
  });
});
