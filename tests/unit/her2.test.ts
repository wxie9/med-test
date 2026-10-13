import { describe, it, expect } from "vitest";
import { deriveHer2Low } from "@/lib/domain/her2";
const base = { id: "b", specimenSite: "primary" as const, specimenDate: "2024-01-01", erPct: 80, prPct: 50, ki67: 20, readVersion: "ASCO/CAP2023" };
describe("deriveHer2Low", () => {
  it("IHC 1+ → low", () => expect(deriveHer2Low({ ...base, her2Ihc: "1+", ish: "not_done" })).toBe("low"));
  it("IHC 2+ ISH negative → low", () => expect(deriveHer2Low({ ...base, her2Ihc: "2+", ish: "negative" })).toBe("low"));
  it("IHC 2+ ISH missing → indeterminate", () => expect(deriveHer2Low({ ...base, her2Ihc: "2+", ish: "not_done" })).toBe("indeterminate"));
  it("IHC 3+ → positive", () => expect(deriveHer2Low({ ...base, her2Ihc: "3+", ish: "not_done" })).toBe("positive"));
  it("IHC 0 → zero", () => expect(deriveHer2Low({ ...base, her2Ihc: "0", ish: "not_done" })).toBe("zero"));
  it("unknown → indeterminate", () => expect(deriveHer2Low({ ...base, her2Ihc: "unknown", ish: "unknown" })).toBe("indeterminate"));
});
