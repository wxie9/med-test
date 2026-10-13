import type { Patient } from "@/lib/domain/types";
const NAMES: Record<string, string> = { "P-A": "王女士", "P-B": "李女士" };
export const displayName = (id: string) => NAMES[id] ?? `患者 ${id}`;
const STAGES: Record<Patient["stage"], string> = { early_adjuvant: "早期 · 辅助治疗期", metastatic: "晚期 · 解救治疗期", survivorship: "康复随访期", lost: "失访", deceased: "已故" };
export const stageLabel = (s: Patient["stage"]) => STAGES[s];
/** Ongoing systemic treatments, e.g. "来曲唑". */
export const currentTreatments = (p: Patient) => p.treatments.filter(t => t.stopReason === "ongoing" && t.drug).map(t => t.drug as string);
