import type { Patient } from "@/lib/domain/types";
import { currentHer2, isHrPositive } from "@/lib/domain/her2";
import { latestBio, hadType } from "./filter";
export type Verdict = "met" | "not_met" | "unknown";
export type Criterion = { id: string; label: string; evaluate: (p: Patient) => Verdict; unknownReason?: string; /** unknown is counted/reasoned but does not demote: the item is checked at site */ verifyAtSite?: boolean };
export type FunnelResult = { steps: { id: string; label: string; met: number; notMet: number; unknown: number; unknownReasons: Record<string, number> }[]; finalMet: string[]; finalUnknown: string[]; pendingVerification: { criterionId: string; patientIds: string[] }[] };
export const PROTOCOL_ADC_301: Criterion[] = [
  { id: "hr_pos", label: "HR 阳性", evaluate: p => { const b = latestBio(p); return !b || b.erPct === null ? "unknown" : isHrPositive(b) ? "met" : "not_met"; }, unknownReason: "缺 ER/PR 结果" },
  { id: "her2_low", label: "HER2 低表达", evaluate: p => { const c = currentHer2(p.biomarkers); return c === "indeterminate" ? "unknown" : c === "low" ? "met" : "not_met"; }, unknownReason: "IHC 2+ 缺 ISH 或结果未知" },
  { id: "metastatic", label: "转移性疾病", evaluate: p => p.stage === "metastatic" ? "met" : "not_met" },
  { id: "prior_cdk46", label: "CDK4/6 抑制剂经治", evaluate: p => hadType(p, "cdk46") ? "met" : "not_met" },
  { id: "no_prior_adc", label: "无 ADC 既往治疗", evaluate: p => p.treatments.some(t => t.type === "adc" && t.start !== null) ? "not_met" : hadType(p, "adc") ? "unknown" : "met", unknownReason: "外院治疗缺日期" },
  { id: "ecog", label: "ECOG 0–1（需现场核查）", evaluate: () => "unknown", unknownReason: "数据源无 ECOG 字段", verifyAtSite: true },
];
/**
 * Three-state funnel: once unknown, a patient stays unknown at later steps unless a later criterion is not_met.
 * verifyAtSite criteria: "unknown" is counted in step.unknown/unknownReasons but does not demote the patient;
 * met patients with an unknown verdict are listed in pendingVerification instead.
 */
export function runFunnel(ps: Patient[], criteria: Criterion[]): FunnelResult {
  let met = ps, unknown: Patient[] = [];
  const steps: FunnelResult["steps"] = [];
  const pendingVerification: FunnelResult["pendingVerification"] = [];
  for (const c of criteria) {
    const step = { id: c.id, label: c.label, met: 0, notMet: 0, unknown: 0, unknownReasons: {} as Record<string, number> };
    const nextMet: Patient[] = [], nextUnknown: Patient[] = [];
    const wasUnknownSet = new Set(unknown);
    const pending: string[] = [];
    for (const p of [...met, ...unknown]) {
      const v = c.evaluate(p); const wasUnknown = wasUnknownSet.has(p);
      if (v === "not_met") step.notMet++;
      else if (v === "unknown" && c.verifyAtSite) {
        step.unknown++; if (c.unknownReason) step.unknownReasons[c.unknownReason] = (step.unknownReasons[c.unknownReason] ?? 0) + 1;
        if (wasUnknown) nextUnknown.push(p); else { nextMet.push(p); pending.push(p.id); }
      }
      else if (v === "unknown" || wasUnknown) { step.unknown++; nextUnknown.push(p); if (v === "unknown" && c.unknownReason) step.unknownReasons[c.unknownReason] = (step.unknownReasons[c.unknownReason] ?? 0) + 1; }
      else { step.met++; nextMet.push(p); }
    }
    met = nextMet; unknown = nextUnknown; steps.push(step);
    if (c.verifyAtSite) pendingVerification.push({ criterionId: c.id, patientIds: pending });
  }
  return { steps, finalMet: met.map(p => p.id), finalUnknown: unknown.map(p => p.id), pendingVerification };
}
