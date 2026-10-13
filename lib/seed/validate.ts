import type { Patient } from "@/lib/domain/types";
const OPEN_END = "9999-12-31";
export function validatePatients(ps: Patient[]): string[] {
  const errs: string[] = [];
  for (const p of ps) {
    const firstMet = p.outcomes.filter(o => o.type === "distant_metastasis").map(o => o.date).sort()[0];
    for (const t of p.treatments) {
      if (t.start && t.end && t.end < t.start) errs.push(`${p.id}:${t.id} end<start`);
      if (t.intent === "metastatic" && !p.outcomes.some(o => o.type === "distant_metastasis" && t.start && o.date <= t.start)) errs.push(`${p.id}:${t.id} metastatic treatment before metastasis`);
      if (t.intent === "adjuvant" && p.surgeryDate && t.start && t.start < p.surgeryDate) errs.push(`${p.id}:${t.id} adjuvant before surgery`);
      if (t.intent === "neoadjuvant" && p.surgeryDate && t.start && t.start >= p.surgeryDate) errs.push(`${p.id}:${t.id} neoadjuvant not before surgery`);
      if (t.intent === "adjuvant" && firstMet && t.start && (t.start > firstMet || (t.end ?? OPEN_END) > firstMet)) errs.push(`${p.id}:${t.id} adjuvant extends past metastasis`);
    }
    const spans = (type: string) => p.treatments.filter(t => t.type === type && t.start).map(t => ({ id: t.id, s: t.start!, e: t.end ?? OPEN_END }));
    for (const c of spans("chemo")) for (const e of spans("endocrine")) if (c.s < e.e && e.s < c.e) errs.push(`${p.id}:${c.id} chemo overlaps endocrine ${e.id}`);
    const death = p.outcomes.find(o => o.type === "death");
    if (death) {
      if (p.stage !== "deceased") errs.push(`${p.id} death without deceased stage`);
      if (!p.outcomes.some(o => ["distant_metastasis", "progression", "local_recurrence"].includes(o.type) && o.date < death.date)) errs.push(`${p.id} death without prior recurrence/progression`);
      if (p.outcomes.some(o => o.type !== "death" && o.date > death.date)) errs.push(`${p.id} event after death`);
      if (p.treatments.some(t => t.start && t.start > death.date)) errs.push(`${p.id} treatment after death`);
      if (p.treatments.some(t => t.stopReason === "ongoing" || (t.start && !t.end))) errs.push(`${p.id} ongoing treatment after death`);
      if (p.pro.some(r => r.submittedAt.slice(0, 10) > death.date)) errs.push(`${p.id} PRO after death`);
      if (p.adherence.some(a => a.date > death.date)) errs.push(`${p.id} adherence after death`);
    } else if (p.stage === "deceased") errs.push(`${p.id} deceased stage without death event`);
    if (p.stage === "metastatic" && !p.outcomes.some(o => o.type === "distant_metastasis")) errs.push(`${p.id} metastatic stage without metastasis event`);
    const ids = new Set<string>(); for (const t of p.treatments) { if (ids.has(t.id)) errs.push(`${p.id} duplicate event ${t.id}`); ids.add(t.id); }
  }
  return errs;
}
