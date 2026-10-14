import { describe, expect, it } from "vitest";
import { projectPatientList } from "@/lib/clinic/patientList";
import { cohortCsv } from "@/lib/clinic/cohortExport";
import { loadSeed } from "@/lib/seed/load";

describe("HR unknown is preserved at clinic data boundaries", () => {
  it.each([{ er: 0, pr: null }, { er: null, pr: 0 }, { er: null, pr: null }])("does not export an indeterminate receptor status as negative: %j", ({ er, pr }) => {
    const p = structuredClone(loadSeed().anchors[0]);
    p.biomarkers = [{ ...p.biomarkers[0], erPct: er, prPct: pr }];
    expect(projectPatientList([p], [])[0].hrPositive).toBeNull();
    expect(cohortCsv([p]).split("\r\n")[1].split(",")[3]).toBe("");
  });
  it("retains known positive or negative results", () => {
    const p = structuredClone(loadSeed().anchors[0]);
    for (const [er, pr, positive] of [[null, 50, true], [50, null, true], [0, 0, false]] as const) {
      p.biomarkers = [{ ...p.biomarkers[0], erPct: er, prPct: pr }];
      expect(projectPatientList([p], [])[0].hrPositive).toBe(positive);
      expect(cohortCsv([p]).split("\r\n")[1].split(",")[3]).toBe(String(positive));
    }
  });
});
