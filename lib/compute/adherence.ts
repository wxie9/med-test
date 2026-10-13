import type { Patient } from "@/lib/domain/types";
/** Stop reasons that count as a discontinuation (completed / ongoing are not). */
const DISCONTINUED = new Set(["toxicity", "patient_choice", "progression", "unknown", "lost", "death"]);
export function adherenceStats(ps: Patient[]) {
  const withLogs = ps.filter(p => p.adherence.length);
  const reasons: Record<string, number> = {}; let due = 0, taken = 0, stopIntent = 0, proN = 0;
  for (const p of withLogs) {
    for (const a of p.adherence) { due += a.due; taken += a.taken; if (a.taken < a.due) { const k = a.missedReason ?? "未填写"; reasons[k] = (reasons[k] ?? 0) + 1; } }
    for (const r of p.pro) if (r.scaleId === "endocrine_monthly_v1") { proN++; if (r.flags.stopIntent) stopIntent++; }
  }
  // per treatment event, across the whole snapshot: adjuvant endocrine events that ended for a reason other than completion
  const stopReasonDist: Record<string, number> = {};
  for (const p of ps) for (const t of p.treatments)
    if (t.type === "endocrine" && t.intent === "adjuvant" && t.end !== null && DISCONTINUED.has(t.stopReason)) stopReasonDist[t.stopReason] = (stopReasonDist[t.stopReason] ?? 0) + 1;
  return { n: withLogs.length, missedReasonDist: reasons, stopReasonDist, stopIntentRate: proN ? stopIntent / proN : 0, meanTakenRate: due ? taken / due : 0 };
}
