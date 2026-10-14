import type { Alert, Patient } from "@/lib/domain/types";
import { currentHer2, deriveHr, type Her2Class } from "@/lib/domain/her2";
import { currentTreatments } from "@/lib/patient/display";
export type PatientListRow = { id: string; anchorKey: string | null; age: number; stage: Patient["stage"]; her2: Her2Class; hrPositive: boolean | null; currentTreatment: string | null; lastContact: string; openAlerts: number };
/** Latest specimen, metastatic preferred on the same day (same ordering as currentHer2). */
function latestSpecimen(p: Patient) {
  return [...p.biomarkers].sort((a, b) => (a.specimenDate === b.specimenDate ? (a.specimenSite === "metastatic" ? -1 : 1) : a.specimenDate < b.specimenDate ? 1 : -1))[0];
}
/** Light rows for the clinic patient list: anchors first (by anchorKey), then the rest in input order. Never full patients. */
export function projectPatientList(patients: Patient[], alerts: Alert[]): PatientListRow[] {
  const open = new Map<string, number>();
  for (const a of alerts) if (a.status !== "closed") open.set(a.patientId, (open.get(a.patientId) ?? 0) + 1);
  const rows = patients.map((p): PatientListRow => {
    const latest = latestSpecimen(p); const tx = currentTreatments(p);
    const hr = latest ? deriveHr(latest) : "indeterminate";
    return { id: p.id, anchorKey: p.anchorKey, age: p.age, stage: p.stage, her2: currentHer2(p.biomarkers), hrPositive: hr === "indeterminate" ? null : hr === "positive", currentTreatment: tx.length ? tx.join(" + ") : null, lastContact: p.lastContact, openAlerts: open.get(p.id) ?? 0 };
  });
  const anchors = rows.filter(r => r.anchorKey !== null).sort((a, b) => a.anchorKey!.localeCompare(b.anchorKey!));
  return [...anchors, ...rows.filter(r => r.anchorKey === null)];
}
