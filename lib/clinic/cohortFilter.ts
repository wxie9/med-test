import type { CohortFilter, Patient, TreatmentEvent } from "@/lib/domain/types";
export type Her2Option = "low" | "zero" | "positive";
export const HER2_OPTIONS: { value: Her2Option; label: string }[] = [{ value: "low", label: "HER2 低表达" }, { value: "zero", label: "HER2-0" }, { value: "positive", label: "HER2 阳性" }];
export const STAGE_OPTIONS: Patient["stage"][] = ["early_adjuvant", "metastatic", "survivorship", "lost", "deceased"];
export const CURRENT_TYPE_OPTIONS: { value: TreatmentEvent["type"]; label: string }[] = [
  { value: "endocrine", label: "内分泌" }, { value: "adc", label: "ADC" }, { value: "chemo", label: "化疗" }, { value: "anti_her2", label: "抗 HER2" }, { value: "cdk46", label: "CDK4/6 抑制剂" },
];
export type CohortFormState = { hrPositive: boolean; her2: Her2Option[]; stage: Patient["stage"][]; everMetastatic: boolean; priorCdk46: boolean; currentTreatmentType: TreatmentEvent["type"][] };
export const EMPTY_FORM: CohortFormState = { hrPositive: false, her2: [], stage: [], everMetastatic: false, priorCdk46: false, currentTreatmentType: [] };
/** Unchecked boxes / empty groups mean "no constraint", so their keys are omitted. */
export function toCohortFilter(f: CohortFormState): CohortFilter {
  const out: CohortFilter = {};
  if (f.hrPositive) out.hrPositive = true;
  if (f.her2.length) out.her2 = [...f.her2];
  if (f.stage.length) out.stage = [...f.stage];
  if (f.everMetastatic) out.everMetastatic = true;
  if (f.priorCdk46) out.priorCdk46 = true;
  if (f.currentTreatmentType.length) out.currentTreatmentType = [...f.currentTreatmentType];
  return out;
}
export const toggle = <T,>(xs: T[], x: T): T[] => (xs.includes(x) ? xs.filter(y => y !== x) : [...xs, x]);
