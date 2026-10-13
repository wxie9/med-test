import type { Patient } from "@/lib/domain/types";
import type { AgentKind } from "./types";
type Stage = Patient["stage"];
/** Metastatic-phase lists apply to metastatic (and, for the doctor, deceased) patients; early_adjuvant / survivorship / lost use the early lists. */
const advanced = (stage?: Stage) => stage === "metastatic" || stage === "deceased";
export const PATIENT_QUESTIONS = {
  early: ["我最近关节痛，能不能先停药？", "下次要做什么检查？", "参加临床研究需要注意什么？"],
  metastatic: ["最近恶心乏力明显，能不能少打一次？", "下次要做什么检查？", "参加临床研究需要注意什么？"],
} as const;
export const DOCTOR_QUESTIONS = {
  early: ["总结这位患者的治疗经过", "根据最近一次问卷起草症状处理建议", "辅助内分泌治疗依从性差时指南建议是什么？"],
  metastatic: ["总结这位患者的治疗经过", "当前线不良事件按 CTCAE 如何分级记录？", "指南对 CDK4/6 后 HER2 低表达的推荐是什么？"],
} as const;
export const RESEARCH_QUESTIONS = ["信息不足中最主要的原因是什么，补齐需要什么数据？", "符合已知条件的有多少例？", "一线后进入二线的比例？", "当前快照共有多少例？"] as const;
/** Quick-question buttons bound to the context: patient and doctor lists follow the patient's stage (visible text must match exactly). */
export function quickQuestions(agent: AgentKind, stage?: Stage): string[] {
  if (agent === "research") return [...RESEARCH_QUESTIONS];
  const lists = agent === "patient" ? PATIENT_QUESTIONS : DOCTOR_QUESTIONS;
  return [...(advanced(stage) ? lists.metastatic : lists.early)];
}
