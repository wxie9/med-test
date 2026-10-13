import { getStore } from "@/lib/state/store";
import { treatmentPatterns, lineGapStatus, runFunnel, PROTOCOL_ADC_301, adherenceStats } from "@/lib/compute";
import { diffDays } from "@/lib/domain/dates";
import type { Patient } from "@/lib/domain/types";
export const USE_CASES = ["overview", "patterns", "feasibility", "adherence"] as const;
export type UseCase = (typeof USE_CASES)[number];
export const isUseCase = (x: string): x is UseCase => (USE_CASES as readonly string[]).includes(x);
export class SnapshotNotFoundError extends Error { constructor() { super("snapshot not found"); } }
const q = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) * p)] : 0; };
function overview(ps: Patient[]) {
  const fu = ps.map(p => diffDays(p.enrolledAt, p.lastContact) / 30.4);
  const deaths = ps.filter(p => p.outcomes.some(o => o.type === "death")).length;
  return {
    n: ps.length,
    events: { metastasis: ps.filter(p => p.outcomes.some(o => o.type === "distant_metastasis")).length, progression: ps.filter(p => p.outcomes.some(o => o.type === "progression")).length, death: deaths },
    followUpMonths: { median: q(fu, 0.5), p25: q(fu, 0.25), p75: q(fu, 0.75) },
    survivalEstimable: deaths >= 10,
    missing: {
      ish: ps.filter(p => p.biomarkers.some(b => b.her2Ihc === "2+" && b.ish === "not_done")).length,
      stopReason: ps.filter(p => p.treatments.some(t => t.stopReason === "unknown")).length,
      externalNoDate: ps.filter(p => p.treatments.some(t => t.source === "external" && t.start === null)).length,
    },
  };
}
export type OverviewResult = ReturnType<typeof overview>;
export type PatternsResult = { patterns: ReturnType<typeof treatmentPatterns>; gapAfterLine1: ReturnType<typeof lineGapStatus>; gapAfterLine2: ReturnType<typeof lineGapStatus>; cutoff: string };
export type FeasibilityResult = { protocol: string } & ReturnType<typeof runFunnel>;
export type AdherenceResult = ReturnType<typeof adherenceStats>;
export type ResearchResult = { overview: OverviewResult; patterns: PatternsResult; feasibility: FeasibilityResult; adherence: AdherenceResult };
/** Pure use-case computation over an immutable snapshot's patients. Throws SnapshotNotFoundError for unknown ids. */
export function researchUseCase<U extends UseCase>(useCase: U, snapshotId: string): ResearchResult[U] {
  const snap = getStore().snapshots.find(s => s.id === snapshotId); if (!snap) throw new SnapshotNotFoundError();
  const ps = snap.patients;
  const r: { [K in UseCase]: () => ResearchResult[K] } = {
    overview: () => overview(ps),
    patterns: () => ({ patterns: treatmentPatterns(ps), gapAfterLine1: lineGapStatus(ps, 1, snap.cutoff), gapAfterLine2: lineGapStatus(ps, 2, snap.cutoff), cutoff: snap.cutoff }),
    feasibility: () => ({ protocol: "XX-ADC-301（虚构）", ...runFunnel(ps, PROTOCOL_ADC_301) }),
    adherence: () => adherenceStats(ps),
  };
  if (!isUseCase(useCase)) throw new Error("unknown use case");
  return r[useCase]();
}
