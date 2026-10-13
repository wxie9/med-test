import type { Patient, ProResponse } from "@/lib/domain/types";
export type ScaleId = ProResponse["scaleId"];
export const SCALE_SYMPTOMS: Record<ScaleId, string[]> = {
  endocrine_monthly_v1: ["关节痛", "潮热", "情绪", "睡眠"],
  treatment_weekly_v1: ["恶心", "乏力", "口腔炎", "腹泻", "手足综合征", "发热"],
};
export const SCALE_TITLES: Record<ScaleId, string> = { endocrine_monthly_v1: "每月症状与用药问卷", treatment_weekly_v1: "每周治疗症状问卷" };
/** Metastatic patients on active treatment fill the weekly scale; adjuvant endocrine patients fill the monthly one. */
export const scaleFor = (p: Patient): ScaleId => (p.stage === "metastatic" ? "treatment_weekly_v1" : "endocrine_monthly_v1");
export const hasAdherenceFlags = (s: ScaleId) => s === "endocrine_monthly_v1";
