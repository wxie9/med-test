import type { Patient } from "@/lib/domain/types";
import { currentHer2, deriveHr } from "@/lib/domain/her2";
import { latestBio, currentTreatments } from "@/lib/compute/filter";
export const CSV_HEADER = ["patient_id", "stage", "her2", "hr_positive", "current_treatment", "last_contact"] as const;
const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
/** One header row + one data row per patient (same patients and order as applyFilter), CRLF line ends. */
export function cohortCsv(ps: Patient[]): string {
  const rows = ps.map(p => {
    const b = latestBio(p);
    const hr = b ? deriveHr(b) : "indeterminate";
    return [p.id, p.stage, currentHer2(p.biomarkers), hr === "indeterminate" ? "" : String(hr === "positive"), currentTreatments(p).map(t => t.drug ?? t.type).join("+"), p.lastContact];
  });
  return [[...CSV_HEADER], ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
