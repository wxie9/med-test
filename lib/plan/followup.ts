import type { FollowUpTask, Patient } from "@/lib/domain/types";
import { addDays, diffDays } from "@/lib/domain/dates";
export type PlanItem = { title: string; due: string; kind: "visit" | "lab" | "imaging" | "pro" };
/** Rule-based plan for the stage plus the clinician's OPEN follow-up tasks for this patient (e.g. 复评 created when an alert is closed). */
export function buildFollowUpPlan(p: Patient, today: string, tasks: FollowUpTask[] = []) {
  const items: PlanItem[] = tasks.filter(t => t.patientId === p.id && t.status === "open").map(t => ({ title: `${t.type}（医生安排）`, due: t.due, kind: "visit" as const }));
  if (p.stage === "early_adjuvant") {
    items.push({ title: "每月症状与用药问卷", due: addDays(today, 30), kind: "pro" });
    const anchor = p.surgeryDate ?? today;
    // Next occurrence of a recurring interval (counted from surgery) strictly after today.
    const nextEvery = (days: number) => addDays(anchor, days * (Math.floor(diffDays(anchor, today) / days) + 1));
    items.push({ title: "乳腺外科随访门诊（每 6 个月）", due: nextEvery(180), kind: "visit" });
    items.push({ title: "乳腺超声/钼靶（每年）", due: nextEvery(365), kind: "imaging" });
    if (p.treatments.some(t => t.type === "endocrine" && t.drug?.includes("唑"))) items.push({ title: "骨密度检查（每年）", due: addDays(today, 90), kind: "lab" });
  } else if (p.stage === "metastatic") {
    items.push({ title: "每周症状问卷", due: addDays(today, 7), kind: "pro" });
    items.push({ title: "下周期治疗前血常规、肝肾功能", due: addDays(today, 14), kind: "lab" });
    items.push({ title: "疗效评估影像（每 2–3 周期）", due: addDays(today, 60), kind: "imaging" });
  }
  return items.sort((a, b) => a.due.localeCompare(b.due));
}
