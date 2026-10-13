import { describe, it, expect } from "vitest";
import { toCohortFilter, EMPTY_FORM, toggle } from "@/lib/clinic/cohortFilter";
describe("cohort filter form", () => {
  it("omits unchecked groups and tri-state boxes", () => { expect(toCohortFilter(EMPTY_FORM)).toEqual({}); });
  it("maps checked boxes to filter keys", () => {
    expect(toCohortFilter({ hrPositive: true, her2: ["low"], stage: ["metastatic"], everMetastatic: false, priorCdk46: true, currentTreatmentType: [] }))
      .toEqual({ hrPositive: true, her2: ["low"], stage: ["metastatic"], priorCdk46: true });
    expect(toCohortFilter({ ...EMPTY_FORM, hrPositive: true, everMetastatic: true, priorCdk46: true })).toEqual({ hrPositive: true, everMetastatic: true, priorCdk46: true });
    expect(toCohortFilter({ ...EMPTY_FORM, currentTreatmentType: ["adc", "chemo"] })).toEqual({ currentTreatmentType: ["adc", "chemo"] });
  });
  it("toggle adds and removes", () => { expect(toggle(["a"], "b")).toEqual(["a", "b"]); expect(toggle(["a", "b"], "a")).toEqual(["b"]); });
});
