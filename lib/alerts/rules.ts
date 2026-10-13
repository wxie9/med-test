import type { Patient, ProResponse, Alert } from "@/lib/domain/types";
export function evaluatePro(_p: Patient, pro: ProResponse) {
  const out: Omit<Alert, "id" | "status" | "assignee" | "timestamps" | "notes">[] = [];
  const max = Math.max(0, ...Object.values(pro.items));
  if (max >= 3) out.push({ patientId: _p.id, kind: "symptom", level: "high", rule: "任一症状 ≥ 3 级", proId: pro.id });
  else if (max === 2) out.push({ patientId: _p.id, kind: "symptom", level: "medium", rule: "任一症状 2 级", proId: pro.id });
  if ((pro.flags.missedDoses14d ?? 0) >= 3 || pro.flags.stopIntent) out.push({ patientId: _p.id, kind: "adherence", level: "high", rule: "两周漏服 ≥ 3 次或有停药念头", proId: pro.id });
  return out;
}
