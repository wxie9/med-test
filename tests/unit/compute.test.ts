import { describe, it, expect } from "vitest";
import { applyFilter, runFunnel, PROTOCOL_ADC_301, lineGapStatus, qualityMetrics, alertMetrics } from "@/lib/compute";
import { getStore } from "@/lib/state/store";
import type { Alert, CohortFilter } from "@/lib/domain/types";
import expected from "@/data/seed/expected.json";
const all = () => [...getStore().patients.values()];
const mkAlert = (id: string, level: "high" | "medium", status: Alert["status"], timestamps: Record<string, string>): Alert =>
  ({ id, patientId: "P-A", kind: "symptom", level, rule: "r", status, assignee: null, timestamps, notes: [], proId: "pro" });
describe("compute", () => {
  it("expected.json counts match", () => { for (const e of expected) if (e.expectedCount !== null) expect(applyFilter(all(), e.filter as CohortFilter).length, e.key).toBe(e.expectedCount); });
  it("funnel: IHC 2+ without ISH lands in unknown", () => {
    const p = structuredClone(getStore().patients.get("P-B")!); p.biomarkers[1].her2Ihc = "2+"; p.biomarkers[1].ish = "not_done";
    const r = runFunnel([p], PROTOCOL_ADC_301); const step = r.steps.find(s => s.id === "her2_low")!; expect(step.unknown).toBe(1); expect(step.met).toBe(0);
  });
  it("funnel: P-B meets HR+/HER2-low/metastatic/prior CDK4/6 but fails 'no prior ADC'", () => {
    const r = runFunnel([getStore().patients.get("P-B")!], PROTOCOL_ADC_301); expect(r.steps.find(s => s.id === "no_prior_adc")!.notMet).toBe(1);
  });
  it("line gap statuses are exhaustive", () => { const s = lineGapStatus(all(), 1, "2026-10-13"); const n = all().filter(p => p.lines.length >= 1).length; expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(n); });
  it("quality returns rates in [0,1]", () => { const q = qualityMetrics(all()); for (const v of Object.values(q.completeness)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); } });
  it("alertMetrics: first-response p50 of accepted alerts by level", () => {
    const t0 = "2026-10-13T00:00:00.000Z";
    const alerts = [
      mkAlert("a1", "high", "closed", { triggered: t0, accepted: "2026-10-13T01:00:00.000Z" }),
      mkAlert("a2", "high", "accepted", { triggered: t0, accepted: "2026-10-13T02:00:00.000Z" }),
      mkAlert("a3", "high", "in_progress", { triggered: t0, accepted: "2026-10-13T03:00:00.000Z" }),
      mkAlert("a4", "high", "unassigned", { triggered: t0 }),
    ];
    const m = alertMetrics(alerts, "2026-10-13T12:00:00.000Z");
    expect(m.firstResponse.high.p50).toBe(2);
    expect(m.firstResponse.medium.p50).toBeNull();
    expect(m.firstResponse.medium.p90).toBeNull();
  });
  it("alertMetrics: counts overdue unassigned/escalated by level threshold and closed this week", () => {
    const now = "2026-10-13T12:00:00.000Z";
    const alerts = [
      mkAlert("h-old", "high", "unassigned", { triggered: "2026-10-13T09:00:00.000Z" }), // 3h > 2h -> overdue
      mkAlert("h-new", "high", "unassigned", { triggered: "2026-10-13T11:00:00.000Z" }), // 1h -> not
      mkAlert("h-esc", "high", "escalated", { triggered: "2026-10-13T06:00:00.000Z" }), // 6h -> overdue
      mkAlert("m-mid", "medium", "unassigned", { triggered: "2026-10-13T00:00:00.000Z" }), // 12h < 24h -> not
      mkAlert("m-old", "medium", "unassigned", { triggered: "2026-10-12T06:00:00.000Z" }), // 30h -> overdue
      mkAlert("h-acc", "high", "accepted", { triggered: "2026-10-12T00:00:00.000Z", accepted: "2026-10-12T01:00:00.000Z" }), // accepted -> not
      mkAlert("c-in", "high", "closed", { triggered: "2026-10-10T00:00:00.000Z", accepted: "2026-10-10T01:00:00.000Z", closed: "2026-10-10T05:00:00.000Z" }),
      mkAlert("c-out", "high", "closed", { triggered: "2026-10-01T00:00:00.000Z", accepted: "2026-10-01T01:00:00.000Z", closed: "2026-10-02T00:00:00.000Z" }),
    ];
    const m = alertMetrics(alerts, now);
    expect(m.overdueUnassigned).toBe(3);
    expect(m.closedThisWeek).toBe(1);
  });
});
