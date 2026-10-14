import { EMERGENCY_TEXT, renderTemplate, type TemplateId } from "./templates";
import { pct1, type ToolName, type ToolResult } from "./tools";
import type { ToolCallRecord } from "./types";

/** A value is authorized only together with its field's meaning, never as a bare number. */
export type ToolFact = { tool: string; field: string; text: string };
const TEMPLATE_INPUTS: Partial<Record<TemplateId, ToolName[]>> = {
  patient_feedback: ["get_latest_feedback", "get_followup_plan"], patient_stop_med: ["get_patient_summary"],
  patient_next_visit: ["get_followup_plan"], patient_research: ["get_patient_summary"],
  doctor_summary: ["get_patient_summary"], doctor_ctcae: ["get_patient_summary", "get_latest_pro"],
  doctor_draft: ["get_latest_pro"], doctor_guideline: ["search_guidelines"],
  research_count: ["funnel"], research_snapshot_size: ["count_cohort"],
  research_gap: ["gap_reasons"], research_line_transition: ["line_transition"],
};
const lineName = (n: number) => ["", "一线", "二线", "三线"][n] ?? `第 ${n} 线`;

/**
 * Controlled factual fragments for providers. Arbitrary natural-language entailment is
 * deliberately unsupported: a numeric claim must reuse one of these server-rendered
 * fragments. Ages, observed symptoms, dates, counts and rates never share authority.
 */
export function toolFacts(calls: ToolCallRecord[]): ToolFact[] {
  const facts: ToolFact[] = [];
  const add = (tool: string, field: string, ...texts: string[]) => texts.forEach(text => facts.push({ tool, field, text }));
  for (const c of calls) {
    switch (c.name) {
      case "get_patient_summary": {
        const s = c.result as Partial<ToolResult<"get_patient_summary">>;
        if (Number.isFinite(s.age)) add(c.name, "age", `患者 ${s.age} 岁`, `年龄 ${s.age} 岁`, `${s.age} 岁`);
        break;
      }
      case "get_latest_pro": {
        const p = c.result as ToolResult<"get_latest_pro">;
        if (p) for (const s of p.symptoms ?? []) add(c.name, `symptoms.${s.symptom}.grade`, `${s.symptom} ${s.grade} 级`, `${s.symptom}（${s.grade} 级）`);
        break;
      }
      case "get_followup_plan": {
        for (const p of c.result as ToolResult<"get_followup_plan">) add(c.name, `plan.${p.title}.due`, `${p.due} ${p.title}`, `${p.title}日期为 ${p.due}`);
        break;
      }
      case "get_latest_feedback": {
        const f = c.result as ToolResult<"get_latest_feedback">;
        if (f) add(c.name, "text", f.text);
        break;
      }
      case "search_guidelines": {
        for (const g of c.result as ToolResult<"search_guidelines">) add(c.name, `guideline.${g.id}`, g.topic, g.text);
        break;
      }
      case "ctcae_grade": {
        const g = c.result as ToolResult<"ctcae_grade">;
        if (g.found) add(c.name, `definition.${g.symptom}.${g.grade}`, `CTCAE v5.0 ${g.symptom} ${g.grade} 级：${g.definition}（处理：${g.action}）`);
        break;
      }
      case "count_cohort": {
        const n = c.result as ToolResult<"count_cohort">;
        add(c.name, "n", `快照共 ${n.n} 例`, `当前快照共有 ${n.n} 例`);
        add(c.name, "matched", `符合筛选条件 ${n.matched} 例`);
        add(c.name, "cutoff", `数据截止 ${n.cutoff}`);
        break;
      }
      case "funnel": {
        const f = c.result as ToolResult<"funnel">;
        add(c.name, "n", `快照共 ${f.n} 例`);
        add(c.name, "finalMetCount", `符合已知条件 ${f.finalMetCount} 例`);
        add(c.name, "finalUnknownCount", `信息不足暂无法判断 ${f.finalUnknownCount} 例`);
        for (const s of f.steps) add(c.name, `steps.${s.label}`, `${s.label} ${s.met}／${s.notMet}／${s.unknown}`);
        break;
      }
      case "gap_reasons": {
        const g = c.result as ToolResult<"gap_reasons">;
        for (const r of g.reasons) add(c.name, `reasons.${r.reason}.count`, `「${r.reason}」${r.count} 人次`);
        break;
      }
      case "create_gap_task": {
        const t = c.result as ToolResult<"create_gap_task">;
        add(c.name, "patientCount", `涉及 ${t.patientCount} 例`);
        break;
      }
      case "line_transition": {
        const t = c.result as ToolResult<"line_transition">;
        const source = lineName(t.lineNo), next = lineName(t.lineNo + 1);
        add(c.name, "n", `有${source}治疗记录的共 ${t.n} 例`);
        add(c.name, "next_line,nextLineRate", `进入${next} ${t.next_line} 例（占 ${pct1(t.nextLineRate)}%）`);
        add(c.name, "on_treatment", `仍在${source}治疗 ${t.on_treatment} 例`);
        for (const [key, label] of [["lost", "失访"], ["deceased", "死亡"], ["unknown", "去向不明"]] as const) add(c.name, key, `${label} ${t[key]} 例`);
        break;
      }
    }
  }
  // Whole server-rendered clauses also carry provenance. This keeps the existing local
  // templates verifiable without trying to infer relationships from model prose.
  const names = new Set(calls.map(c => c.name));
  for (const [id, inputs] of Object.entries(TEMPLATE_INPUTS) as [TemplateId, ToolName[]][]) {
    if (!inputs.every(n => names.has(n))) continue;
    try {
      for (const clause of renderTemplate(id, calls).split(/[\n。；]/).filter(Boolean)) add("server_template", id, clause);
    } catch { /* Partial or mismatched calls do not authorize a template. */ }
  }
  return facts;
}

/** Canonical display names contain digits, but do not assert patient measurements. */
export const TECHNICAL_IDENTIFIERS = /HER2|CDK4\/6|CTCAE\s*v5\.0|XX-ADC-301/g;
export const STATIC_SAFETY_FACT = EMERGENCY_TEXT;
