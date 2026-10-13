import type { Patient } from "@/lib/domain/types";
export function validatePatients(ps: Patient[]): string[] {
  const errs: string[] = [];
  for (const p of ps) {
    for (const t of p.treatments) {
      if (t.start && t.end && t.end < t.start) errs.push(`${p.id}:${t.id} end<start`);
      if (t.intent === "metastatic" && !p.outcomes.some(o => o.type === "distant_metastasis" && t.start && o.date <= t.start)) errs.push(`${p.id}:${t.id} metastatic treatment before metastasis`);
      if (t.intent === "adjuvant" && p.surgeryDate && t.start && t.start < p.surgeryDate) errs.push(`${p.id}:${t.id} adjuvant before surgery`);
    }
    const death = p.outcomes.find(o => o.type === "death");
    if (death) {
      if (p.stage !== "deceased") errs.push(`${p.id} death without deceased stage`);
      if (p.outcomes.some(o => o.type !== "death" && o.date > death.date)) errs.push(`${p.id} event after death`);
      if (p.treatments.some(t => t.start && t.start > death.date)) errs.push(`${p.id} treatment after death`);
    }
    if (p.stage === "metastatic" && !p.outcomes.some(o => o.type === "distant_metastasis")) errs.push(`${p.id} metastatic stage without metastasis event`);
    const ids = new Set<string>(); for (const t of p.treatments) { if (ids.has(t.id)) errs.push(`${p.id} duplicate event ${t.id}`); ids.add(t.id); }
  }
  return errs;
}
