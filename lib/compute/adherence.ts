import type { Patient } from "@/lib/domain/types";
export function adherenceStats(ps: Patient[]) {
  const withLogs = ps.filter(p => p.adherence.length);
  const reasons: Record<string, number> = {}; let due = 0, taken = 0, stopIntent = 0, proN = 0;
  for (const p of withLogs) {
    for (const a of p.adherence) { due += a.due; taken += a.taken; if (a.taken < a.due) { const k = a.missedReason ?? "未填写"; reasons[k] = (reasons[k] ?? 0) + 1; } }
    for (const r of p.pro) if (r.scaleId === "endocrine_monthly_v1") { proN++; if (r.flags.stopIntent) stopIntent++; }
  }
  return { n: withLogs.length, missedReasonDist: reasons, stopIntentRate: proN ? stopIntent / proN : 0, meanTakenRate: due ? taken / due : 0 };
}
