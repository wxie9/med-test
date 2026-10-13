import type { Patient } from "@/lib/domain/types";
import { addDays } from "@/lib/domain/dates";
export function buildFollowUpPlan(p: Patient, today: string) {
  const items: { title: string; due: string; kind: "visit" | "lab" | "imaging" | "pro" }[] = [];
  if (p.stage === "early_adjuvant") {
    items.push({ title: "每月症状与用药问卷", due: addDays(today, 30), kind: "pro" });
    items.push({ title: "乳腺外科随访门诊（每 6 个月）", due: addDays(p.surgeryDate ?? today, 180 * (Math.floor(((Date.parse(today) - Date.parse(p.surgeryDate ?? today)) / 86_400_000) / 180) + 1)), kind: "visit" });
    items.push({ title: "乳腺超声/钼靶（每年）", due: addDays(p.surgeryDate ?? today, 365), kind: "imaging" });
    if (p.treatments.some(t => t.type === "endocrine" && t.drug?.includes("唑"))) items.push({ title: "骨密度检查（每年）", due: addDays(today, 90), kind: "lab" });
  } else if (p.stage === "metastatic") {
    items.push({ title: "每周症状问卷", due: addDays(today, 7), kind: "pro" });
    items.push({ title: "下周期治疗前血常规、肝肾功能", due: addDays(today, 14), kind: "lab" });
    items.push({ title: "疗效评估影像（每 2–3 周期）", due: addDays(today, 60), kind: "imaging" });
  }
  return items.sort((a, b) => a.due.localeCompare(b.due));
}
