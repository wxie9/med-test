import type { TreatmentEvent, SystemicTherapyLine } from "./types";
import { diffDays } from "./dates";
export const LINE_RULES_VERSION = "lines-v1";
const SYSTEMIC = new Set(["chemo", "endocrine", "anti_her2", "cdk46", "adc"]);
/** 规则 v1：转移性意图的系统治疗事件按开始日排序；新事件开始日距当前线最早开始日 ≤ 28 天视为联合并入当前线；否则若当前线已有停止原因为 progression/toxicity/patient_choice 或新事件开始晚于当前线所有事件结束日 → 开新线。 */
export function inferLines(events: TreatmentEvent[], rulesVersion = LINE_RULES_VERSION): SystemicTherapyLine[] {
  const evs = events.filter(e => e.intent === "metastatic" && SYSTEMIC.has(e.type) && e.start).sort((a, b) => a.start!.localeCompare(b.start!));
  const lines: SystemicTherapyLine[] = [];
  for (const e of evs) {
    const cur = lines[lines.length - 1];
    if (cur && diffDays(cur.start, e.start!) <= 28) { cur.eventIds.push(e.id); cur.end = maxEnd(cur.end, e.end); continue; }
    lines.push({ lineNo: lines.length + 1, eventIds: [e.id], start: e.start!, end: e.end, rulesVersion, reviewStatus: "unreviewed", reviewer: null });
  }
  return lines;
}
function maxEnd(a: string | null, b: string | null) { if (a === null || b === null) return null; return a > b ? a : b; }
