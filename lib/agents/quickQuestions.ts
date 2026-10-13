import type { AgentKind } from "./types";
/** Quick-question buttons per assistant (visible text must match exactly). */
export const QUICK_QUESTIONS: Record<AgentKind, string[]> = {
  patient: ["我最近关节痛，能不能先停药？", "下次要做什么检查？", "参加临床研究需要注意什么？"],
  doctor: ["总结这位患者的治疗经过", "根据最近一次问卷起草症状处理建议", "当前线不良事件按 CTCAE 如何分级记录？", "指南对 CDK4/6 后 HER2 低表达的推荐是什么？"],
  research: ["信息不足中最主要的原因是什么，补齐需要什么数据？", "符合已知条件的有多少例？", "一线后进入二线的比例？", "当前快照共有多少例？"],
};
