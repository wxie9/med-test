import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { recordAdherence } from "@/lib/adherence/checkin";
import { getStore, resetStore } from "@/lib/state/store";
describe("recordAdherence", () => {
  beforeEach(() => { resetStore(); process.env.DEMO_FIXED_NOW = "2026-10-14T10:00:00+08:00"; });
  afterEach(() => { delete process.env.DEMO_FIXED_NOW; });
  it("appends today's row, then overwrites it on a second check-in", () => {
    const p = getStore().patients.get("P-A")!; const n = p.adherence.length;
    recordAdherence({ patientId: "P-A", taken: 1 });
    expect(p.adherence).toHaveLength(n + 1);
    expect(p.adherence.at(-1)).toEqual({ date: "2026-10-14", due: 1, taken: 1, missedReason: null });
    recordAdherence({ patientId: "P-A", taken: 0, missedReason: "忘记" });
    expect(p.adherence).toHaveLength(n + 1);
    expect(p.adherence.at(-1)).toEqual({ date: "2026-10-14", due: 1, taken: 0, missedReason: "忘记" });
  });
  it("rejects unknown patient", () => expect(() => recordAdherence({ patientId: "nope", taken: 1 })).toThrow());
});
