import { describe, it, expect } from "vitest";
import { inferLines } from "@/lib/domain/lines";
import type { TreatmentEvent } from "@/lib/domain/types";
const ev = (p: Partial<TreatmentEvent> & { id: string }): TreatmentEvent => ({ type: "chemo", intent: "metastatic", drug: null, start: "2025-01-01", end: null, stopReason: "ongoing", source: "in_house", ...p });
describe("inferLines", () => {
  it("ignores adjuvant events", () => {
    expect(inferLines([ev({ id: "a", intent: "adjuvant", type: "endocrine" })])).toHaveLength(0);
  });
  it("endocrine + cdk46 overlapping = one line", () => {
    const lines = inferLines([ev({ id: "e", type: "endocrine", start: "2025-01-01", end: "2025-08-01", stopReason: "progression" }), ev({ id: "c", type: "cdk46", start: "2025-01-05", end: "2025-08-01", stopReason: "progression" })]);
    expect(lines).toHaveLength(1); expect(lines[0].eventIds.sort()).toEqual(["c", "e"]);
  });
  it("progression then new drug = next line", () => {
    const lines = inferLines([ev({ id: "e", type: "endocrine", start: "2025-01-01", end: "2025-08-01", stopReason: "progression" }), ev({ id: "a", type: "adc", start: "2025-08-15", end: null })]);
    expect(lines.map(l => l.lineNo)).toEqual([1, 2]); expect(lines[1].end).toBeNull();
  });
  it("event with null start is excluded and does not throw", () => {
    expect(inferLines([ev({ id: "x", start: null })])).toHaveLength(0);
  });
});
