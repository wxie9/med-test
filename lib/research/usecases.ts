import { getStore } from "@/lib/state/store";
import { treatmentPatterns, lineGapStatus, runFunnel, PROTOCOL_ADC_301, adherenceStats } from "@/lib/compute";
import { diffDays } from "@/lib/domain/dates";
import type { Patient } from "@/lib/domain/types";
export const USE_CASES = ["overview", "patterns", "feasibility", "adherence"] as const;
export type UseCase = (typeof USE_CASES)[number];
export const isUseCase = (x: string): x is UseCase => (USE_CASES as readonly string[]).includes(x);
export class SnapshotNotFoundError extends Error { constructor() { super("snapshot not found"); } }
/** Footer statistics shown under every research chart; null = not applicable to this use case. */
export type StatSummary = { n: number; events: number | null; followUpMedian: number | null; cutoff: string };
const q = (arr: number[], p: number) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) * p)] : 0; };
const followUpMonths = (ps: Patient[]) => ps.map(p => diffDays(p.enrolledAt, p.lastContact) / 30.4);
const withOutcome = (ps: Patient[], type: Patient["outcomes"][number]["type"]) => ps.filter(p => p.outcomes.some(o => o.type === type)).length;
function overview(ps: Patient[], cutoff: string) {
  const fu = followUpMonths(ps);
  const events = { metastasis: withOutcome(ps, "distant_metastasis"), progression: withOutcome(ps, "progression"), death: withOutcome(ps, "death") };
  const followUp = { median: q(fu, 0.5), p25: q(fu, 0.25), p75: q(fu, 0.75) };
  const summary: StatSummary = { n: ps.length, events: events.metastasis + events.progression + events.death, followUpMedian: followUp.median, cutoff };
  return {
    n: ps.length, events, followUpMonths: followUp, survivalEstimable: events.death >= 10,
    missing: {
      ish: ps.filter(p => p.biomarkers.some(b => b.her2Ihc === "2+" && b.ish === "not_done")).length,
      stopReason: ps.filter(p => p.treatments.some(t => t.stopReason === "unknown")).length,
      externalNoDate: ps.filter(p => p.treatments.some(t => t.source === "external" && t.start === null)).length,
    },
    summary,
  };
}
function patterns(ps: Patient[], cutoff: string) {
  const withLines = ps.filter(p => p.lines.length);
  const summary: StatSummary = { n: withLines.length, events: withOutcome(withLines, "progression"), followUpMedian: q(followUpMonths(withLines), 0.5), cutoff };
  return { patterns: treatmentPatterns(ps), gapAfterLine1: lineGapStatus(ps, 1, cutoff), gapAfterLine2: lineGapStatus(ps, 2, cutoff), cutoff, summary };
}
/** Counts only: patient ids from runFunnel never leave the server (Task 10 recomputes them for candidate requests). */
function feasibility(ps: Patient[], cutoff: string) {
  const f = runFunnel(ps, PROTOCOL_ADC_301);
  const label = (id: string) => PROTOCOL_ADC_301.find(c => c.id === id)?.label ?? id;
  const summary: StatSummary = { n: ps.length, events: null, followUpMedian: q(followUpMonths(ps), 0.5), cutoff };
  return {
    protocol: "XX-ADC-301（虚构）", steps: f.steps, finalMetCount: f.finalMet.length, finalUnknownCount: f.finalUnknown.length,
    pendingVerification: f.pendingVerification.map(v => ({ criterionId: v.criterionId, label: label(v.criterionId), count: v.patientIds.length })),
    summary,
  };
}
function adherence(ps: Patient[], cutoff: string) {
  const a = adherenceStats(ps);
  const summary: StatSummary = { n: a.n, events: null, followUpMedian: null, cutoff };
  return { ...a, summary };
}
export type OverviewResult = ReturnType<typeof overview>;
export type PatternsResult = ReturnType<typeof patterns>;
export type FeasibilityResult = ReturnType<typeof feasibility>;
export type AdherenceResult = ReturnType<typeof adherence>;
export type ResearchResult = { overview: OverviewResult; patterns: PatternsResult; feasibility: FeasibilityResult; adherence: AdherenceResult };
const HANDLERS: { [K in UseCase]: (ps: Patient[], cutoff: string) => ResearchResult[K] } = { overview, patterns, feasibility, adherence };
/** Pure use-case computation over an immutable snapshot's patients. Throws SnapshotNotFoundError for unknown ids. */
export function researchUseCase<U extends UseCase>(useCase: U, snapshotId: string): ResearchResult[U] {
  const snap = getStore().snapshots.find(s => s.id === snapshotId); if (!snap) throw new SnapshotNotFoundError();
  if (!isUseCase(useCase)) throw new Error("unknown use case");
  return HANDLERS[useCase](snap.patients, snap.cutoff);
}
