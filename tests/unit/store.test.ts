import { describe, it, expect } from "vitest";
import { getStore, resetStore, serializeLite } from "@/lib/state/store";
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
});
