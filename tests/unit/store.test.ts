import { describe, it, expect } from "vitest";
import { getStore, resetStore, serialize, serializeLite } from "@/lib/state/store";
import { loadSeed } from "@/lib/seed/load";
import type { Alert, Patient } from "@/lib/domain/types";
describe("store", () => {
  it("loads anchors + cohort once", () => { const s = getStore(); expect(s.patients.get("P-A")?.anchorKey).toBe("A"); expect(s.patients.size).toBeGreaterThan(2000); });
  it("reset clears runtime collections and keeps patients", () => {
    const s = getStore(); s.alerts.push({ id: "x" } as unknown as Alert); resetStore();
    const t = getStore(); expect(t.alerts).toHaveLength(0); expect(t.patients.get("P-B")).toBeTruthy();
  });
  it("reset restores anchor PRO count (no duplication)", () => {
    const n = getStore().patients.get("P-A")!.pro.length; getStore().patients.get("P-A")!.pro.push({} as unknown as Patient["pro"][number]); resetStore();
    expect(getStore().patients.get("P-A")!.pro.length).toBe(n);
  });
  it("reset increments seedVersion by 1", () => {
    const v = getStore().seedVersion; resetStore();
    expect(getStore().seedVersion).toBe(v + 1);
  });
  it("store patients are clones, not the seed objects", () => {
    const p = getStore().patients.get("P-A")!; const n = p.pro.length; p.pro.push({} as unknown as Patient["pro"][number]); p.age = -1;
    const fresh = loadSeed().anchors.find(a => a.id === "P-A")!;
    expect(fresh.pro.length).toBe(n); expect(fresh.age).not.toBe(-1);
    resetStore();
  });
  it("serializeLite omits patients and reports patientCount", () => {
    const lite = serializeLite(getStore()) as Record<string, unknown>;
    expect(lite.patients).toBeUndefined(); expect(lite.patientCount).toBe(getStore().patients.size); expect(lite.seedVersion).toBe(getStore().seedVersion);
  });
  it("serializeLite strips snapshot patients and reports per-snapshot patientCount; serialize keeps them", () => {
    const pts = [...getStore().patients.values()].slice(0, 3);
    getStore().snapshots.push({ id: "SNAP-x-v1", cohortId: "c", cutoff: "2026-10-13", createdAt: "t", patients: pts, quality: { n: 3 } });
    const snap = (serializeLite(getStore()).snapshots as Record<string, unknown>[])[0];
    expect("patients" in snap).toBe(false); expect(snap.patientCount).toBe(3); expect(snap.id).toBe("SNAP-x-v1");
    expect(serialize(getStore()).snapshots[0].patients).toHaveLength(3);
    resetStore();
  });
  it("serializeLite emits cohorts without patientIds plus patientCount; serialize keeps patientIds", () => {
    getStore().cohorts.push({ id: "c1", name: "n", filter: {}, createdBy: "x", createdAt: "t", patientIds: ["P-A", "P-B"], status: "submitted" });
    const c = (serializeLite(getStore()).cohorts as Record<string, unknown>[])[0];
    expect("patientIds" in c).toBe(false); expect(c.patientCount).toBe(2); expect(c.name).toBe("n");
    expect(serialize(getStore()).cohorts[0].patientIds).toEqual(["P-A", "P-B"]);
    resetStore();
  });
  it("serializeLite emits candidateRequests as pharma summaries (no candidates, no patient ids); serialize keeps them", () => {
    getStore().candidateRequests.push({ id: "cand-1", snapshotId: "SNAP-2026-10-13-v1", protocolId: "XX-ADC-301", createdAt: "t",
      candidates: [{ patientId: "P-0001", status: "confirmed" }, { patientId: "P-0002", status: "pending" }, { patientId: "P-A", status: "rejected" }] });
    const r = (serializeLite(getStore()).candidateRequests as Record<string, unknown>[])[0];
    expect("candidates" in r).toBe(false);
    expect(r).toEqual({ id: "cand-1", snapshotId: "SNAP-2026-10-13-v1", protocolId: "XX-ADC-301", total: 3, confirmed: 1, createdAt: "t" });
    const json = JSON.stringify(serializeLite(getStore()).candidateRequests);
    for (const pid of ["P-0001", "P-0002", "P-A"]) expect(json).not.toContain(pid);
    expect(serialize(getStore()).candidateRequests[0].candidates).toHaveLength(3);
    resetStore();
  });
});
