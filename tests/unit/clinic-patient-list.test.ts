import { describe, it, expect } from "vitest";
import { projectPatientList } from "@/lib/clinic/patientList";
import { getStore } from "@/lib/state/store";
import type { Alert } from "@/lib/domain/types";
const alert = (id: string, patientId: string, status: Alert["status"]): Alert => ({ id, patientId, kind: "symptom", level: "high", rule: "r", status, assignee: null, timestamps: { triggered: "2026-10-13T01:00:00Z" }, notes: [], proId: "p" });
describe("projectPatientList", () => {
  const s = getStore();
  const pa = s.patients.get("P-A")!, pb = s.patients.get("P-B")!;
  const others = [...s.patients.values()].filter(p => p.anchorKey === null).slice(0, 5);
  it("puts anchors first and keeps the row light", () => {
    const rows = projectPatientList([...others, pb, pa], []);
    expect(rows.slice(0, 2).map(r => r.id).sort()).toEqual(["P-A", "P-B"]);
    expect(rows.slice(2).every(r => r.anchorKey === null)).toBe(true);
    expect(Object.keys(rows[0]).sort()).toEqual(["age", "anchorKey", "currentTreatment", "her2", "hrPositive", "id", "lastContact", "openAlerts", "stage"]);
    const b = rows.find(r => r.id === "P-B")!;
    expect(b.her2).toBe("low"); expect(b.hrPositive).toBe(true); expect(b.currentTreatment).toBe("德曲妥珠单抗");
  });
  it("counts only non-closed alerts as open", () => {
    const rows = projectPatientList([pa, pb], [alert("a1", "P-A", "unassigned"), alert("a2", "P-A", "closed"), alert("a3", "P-A", "pending_review"), alert("a4", "P-B", "closed")]);
    expect(rows.find(r => r.id === "P-A")!.openAlerts).toBe(2);
    expect(rows.find(r => r.id === "P-B")!.openAlerts).toBe(0);
  });
});
