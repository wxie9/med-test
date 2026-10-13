import type { Patient, CohortFilter } from "@/lib/domain/types";
import { currentHer2, isHrPositive } from "@/lib/domain/her2";
export const latestBio = (p: Patient) => [...p.biomarkers].sort((a, b) => b.specimenDate.localeCompare(a.specimenDate))[0];
export const hadType = (p: Patient, type: string) => p.treatments.some(t => t.type === type);
export const currentTreatments = (p: Patient) => p.treatments.filter(t => t.start && !t.end);
export function applyFilter(ps: Patient[], f: CohortFilter): Patient[] {
  return ps.filter(p => {
    const b = latestBio(p);
    if (f.hrPositive !== undefined && (!b || isHrPositive(b) !== f.hrPositive)) return false;
    // indeterminate HER2 never matches a her2 filter
    const c = currentHer2(p.biomarkers);
    if (f.her2 && (c === "indeterminate" || !f.her2.includes(c))) return false;
    if (f.stage && !f.stage.includes(p.stage)) return false;
    if (f.priorCdk46 !== undefined && hadType(p, "cdk46") !== f.priorCdk46) return false;
    if (f.intent && !p.treatments.some(t => f.intent!.includes(t.intent))) return false;
    if (f.currentTreatmentType && !currentTreatments(p).some(t => f.currentTreatmentType!.includes(t.type))) return false;
    return true;
  });
}
