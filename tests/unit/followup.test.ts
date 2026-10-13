import { describe, it, expect } from "vitest";
import { buildFollowUpPlan } from "@/lib/plan/followup";
import { getStore } from "@/lib/state/store";
describe("buildFollowUpPlan", () => {
  it("adds a bone-density item for P-A (letrozole) and a weekly PRO item for P-B, sorted by due", () => {
    const s = getStore();
    const a = buildFollowUpPlan(s.patients.get("P-A")!, "2026-10-14");
    expect(a.some(i => i.kind === "lab" && i.title.includes("骨密度"))).toBe(true);
    expect(a.map(i => i.due)).toEqual([...a.map(i => i.due)].sort());
    const b = buildFollowUpPlan(s.patients.get("P-B")!, "2026-10-14");
    expect(b).toContainEqual({ title: "每周症状问卷", due: "2026-10-21", kind: "pro" });
    expect(b.some(i => i.title.includes("骨密度"))).toBe(false);
  });
  it("never schedules an item before today (rolls yearly imaging to the next anniversary)", () => {
    const s = getStore();
    for (const id of ["P-A", "P-B"]) for (const i of buildFollowUpPlan(s.patients.get(id)!, "2026-10-14")) expect(i.due >= "2026-10-14", `${id} ${i.title} ${i.due}`).toBe(true);
    const img = buildFollowUpPlan(s.patients.get("P-A")!, "2026-10-14").find(i => i.kind === "imaging")!;
    expect(img.due).toBe("2027-07-10");
  });
  it("merges the clinician's OPEN follow-up tasks for this patient as 医生安排 visit items", () => {
    const p = getStore().patients.get("P-A")!;
    const mk = (id: string, patientId: string, type: string, due: string, status: "open" | "done") => ({ id, patientId, type, due, owner: "x", status, createdAt: "2026-10-13T02:00:00.000Z" });
    const plan = buildFollowUpPlan(p, "2026-10-14", [mk("t1", "P-A", "复评", "2026-10-27", "open"), mk("t2", "P-A", "门诊", "2026-10-20", "done"), mk("t3", "P-B", "检查", "2026-10-15", "open")]);
    expect(plan).toContainEqual({ title: "复评（医生安排）", due: "2026-10-27", kind: "visit" });
    expect(plan.some(i => i.title.startsWith("门诊（医生安排）") || i.title.startsWith("检查（医生安排）"))).toBe(false);
    expect(plan.map(i => i.due)).toEqual([...plan.map(i => i.due)].sort());
    expect(buildFollowUpPlan(p, "2026-10-14")).toEqual(buildFollowUpPlan(p, "2026-10-14", []));
  });
});
