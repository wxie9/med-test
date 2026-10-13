import { describe, it, expect } from "vitest";
import { getStore, resetStore } from "@/lib/state/store";
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
});
