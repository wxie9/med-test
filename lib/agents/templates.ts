import { pct1, type ToolName, type ToolResult } from "./tools";
import type { AgentKind, ToolCallRecord } from "./types";
export type TemplateId =
  | "patient_stop_med" | "patient_next_visit" | "patient_research"
  | "doctor_summary" | "doctor_ctcae" | "doctor_guideline"
  | "research_count" | "research_gap" | "research_line_transition"
  | "generic_boundary";
export const GENERIC_BOUNDARY = "这个问题超出了演示助手的范围。您可以尝试下方的快捷问题，或联系您的医生/个案管理师。";
type Rule = { id: TemplateId; keywords: string[]; pages?: string[] };
/** First matching rule wins; order matters within an agent. */
const RULES: Record<AgentKind, Rule[]> = {
  patient: [
    { id: "patient_stop_med", keywords: ["停药", "减药", "关节痛"] },
    { id: "patient_research", keywords: ["临床研究", "研究", "试验"] },
    { id: "patient_next_visit", keywords: ["检查", "复查", "随访", "复诊"] },
  ],
  doctor: [
    { id: "doctor_ctcae", keywords: ["分级", "CTCAE", "不良事件"], pages: ["patient"] },
    { id: "doctor_summary", keywords: ["总结", "治疗经过"], pages: ["patient"] },
    { id: "doctor_guideline", keywords: ["指南"] },
  ],
  research: [
    { id: "research_gap", keywords: ["原因", "补齐", "缺失"] },
    { id: "research_line_transition", keywords: ["二线", "比例"] },
    { id: "research_count", keywords: ["多少例", "符合"] },
  ],
};
export function pickTemplate(agent: AgentKind, page: string, userText: string): TemplateId {
  const text = userText.toUpperCase();
  return RULES[agent].find(r => (!r.pages || r.pages.includes(page)) && r.keywords.some(k => text.includes(k.toUpperCase())))?.id ?? "generic_boundary";
}

/** Side-effect-free AE focus per current treatment class (first class present wins). */
const AE_FOCUS: [string, string[]][] = [["adc", ["间质性肺病", "恶心"]], ["cdk46", ["中性粒细胞减少", "腹泻"]], ["chemo", ["中性粒细胞减少", "周围神经病变"]], ["anti_her2", ["腹泻", "乏力"]], ["endocrine", ["关节痛", "潮热"]]];
type Call = (name: ToolName, args?: Record<string, unknown>) => unknown;
/** Runs the tools a template needs (patientId/snapshotId are bound from the request context by the tool session). */
export function runTemplateTools(id: TemplateId, call: Call, userText: string): void {
  switch (id) {
    case "patient_stop_med": call("get_patient_summary"); call("search_guidelines", { query: "关节痛 停药" }); return;
    case "patient_next_visit": call("get_followup_plan"); call("search_guidelines", { query: "随访频率" }); return;
    case "patient_research": call("get_patient_summary"); call("search_guidelines", { query: "临床研究" }); return;
    case "doctor_summary": call("get_patient_summary"); return;
    case "doctor_ctcae": {
      const s = call("get_patient_summary") as ToolResult<"get_patient_summary">;
      const focus = AE_FOCUS.find(([type]) => s.current.some(t => t.typeCode === type));
      for (const symptom of focus?.[1] ?? []) for (const grade of [1, 2, 3]) call("ctcae_grade", { symptom, grade });
      call("search_guidelines", { query: "CTCAE 不良事件" }); return;
    }
    case "doctor_guideline": call("search_guidelines", { query: userText }); return;
    case "research_count": call("funnel"); return;
    case "research_gap": {
      const g = call("gap_reasons") as ToolResult<"gap_reasons">;
      if (g.reasons.length) call("create_gap_task", { field: g.reasons[0].reason });
      return;
    }
    case "research_line_transition": call("line_transition", { lineNo: 1 }); return;
    case "generic_boundary": return;
  }
}

/** Renders a template; every number in the text is read from a tool result. */
export function renderTemplate(id: TemplateId, toolResults: ToolCallRecord[]): string {
  const res = <N extends ToolName>(name: N) => toolResults.find(c => c.name === name)?.result as ToolResult<N>;
  switch (id) {
    case "patient_stop_med": {
      const s = res("get_patient_summary");
      const ai = s.current.find(t => t.typeCode === "endocrine" && /唑|依西美坦/.test(t.drug ?? ""));
      return [
        `关节痛${ai ? `是${ai.drug}这类芳香化酶抑制剂较常见的不适` : "在内分泌治疗期间较常见"}，多数通过规律运动、热敷或对症止痛能够缓解。`,
        "请不要自行停药或减量——是否需要调整用药，必须由医生确认。",
        "建议您：① 在“问卷”里如实记录关节痛的程度；② 下次门诊时告诉医生，医生会评估对症处理或换药等办法；③ 如果疼痛明显影响睡眠或日常活动，请通过“消息”联系个案管理师，提前安排门诊。",
      ].join("\n");
    }
    case "patient_next_visit": {
      const plan = res("get_followup_plan");
      if (!plan.length) return "目前没有计划内的检查安排，请按医生交代的时间复诊；如有不适请通过“消息”联系个案管理师。";
      return ["根据您的随访计划，接下来的安排：", ...plan.map(i => `· ${i.due}　${i.title}`), "如需改期，请在“消息”中联系个案管理师；检查结果会由医生在门诊与您沟通。"].join("\n");
    }
    case "patient_research": {
      const s = res("get_patient_summary");
      return [
        "参加临床研究前，请注意以下几点：",
        "① 完全自愿：是否参加由您决定，随时可以退出，不影响常规治疗。",
        "② 充分知情：签字前问清研究目的、流程、可能的获益与风险，以及其他可选的治疗方案。",
        "③ 用药安全：不要因为准备入组而自行停药或换药；入组后新增任何药物都要告诉研究医生。",
        "④ 隐私保护：研究使用去标识化数据，只在您同意的范围内使用。",
        `${s.consentResearch ? "您目前已同意接收研究相关联系" : "您目前尚未同意接收研究相关联系"}；如有合适的研究机会，医生会通过“消息”联系您，是否适合请与医生确认。`,
      ].join("\n");
    }
    case "doctor_summary": {
      const s = res("get_patient_summary");
      const tx = s.treatments.map(t => `· ${t.start ?? "日期不详"}${t.end && t.end !== t.start ? ` 至 ${t.end}` : t.status === "进行中" ? " 至今" : ""}　${t.intent} · ${t.type}${t.drug ? `（${t.drug}）` : ""}，${t.status}${t.source === "外院" ? "（外院）" : ""}`);
      const lines = s.lines.length ? `转移后系统治疗共 ${s.lines.length} 线：${s.lines.map(l => `${l.lineNo} 线 ${l.regimen}（${l.start} 起${l.end ? `，${l.end} 止` : "，进行中"}）`).join("；")}` : "尚无转移后系统治疗线。";
      const cur = s.current.length ? `当前治疗：${s.current.map(t => `${t.type}${t.drug ? `（${t.drug}）` : ""}`).join("、")}。` : "当前无进行中的治疗。";
      return [`${s.age} 岁，${s.stage}；最新标本 HR ${s.hr}、${s.her2}；BRCA ${s.brca}。`, "治疗经过：", ...tx, lines, cur, "（摘要由结构化数据生成，治疗线为规则推断，请以病历为准。）"].join("\n");
    }
    case "doctor_ctcae": {
      const s = res("get_patient_summary");
      const grades = toolResults.filter(c => c.name === "ctcae_grade").map(c => c.result as ToolResult<"ctcae_grade">).filter(g => g.found);
      const symptoms = [...new Set(grades.map(g => g.symptom))];
      const cur = s.current.length ? s.current.map(t => `${t.type}${t.drug ? `（${t.drug}）` : ""}`).join("、") : null;
      const body = symptoms.map(sym => `· ${sym}：${grades.filter(g => g.symptom === sym).map(g => `${g.grade} 级 ${g.definition}（处理：${g.action}）`).join("；")}`);
      return [
        cur ? `当前线治疗：${cur}。建议按 CTCAE v5.0 重点记录：` : "当前无进行中的系统治疗，按 CTCAE v5.0 记录的通用要求如下：",
        ...body,
        "记录要求：注明发生日期、最高级别、与药物的相关性、采取的措施（继续/暂停/减量/停药）及转归。",
      ].join("\n");
    }
    case "doctor_guideline": {
      const hits = res("search_guidelines");
      if (!hits.length) return "未找到依据：指南要点库中没有与该问题相关的条目。请查阅指南原文或提交 MDT 讨论，助手不据此给出推荐。";
      return ["指南要点（CSCO 乳腺癌诊疗指南 2026 版要点转述，待专家审阅）：", ...hits.map(g => `· [${g.id}] ${g.topic}：${g.text}`), "具体方案请结合患者情况及 MDT 意见决定。"].join("\n");
    }
    case "research_count": {
      const f = res("funnel");
      const ecog = f.pendingVerification.reduce((s, v) => s + v.count, 0);
      return [
        `按${f.protocol}标准，快照共 ${f.n} 例：符合已知条件 ${f.finalMetCount} 例（仍需现场核查 ECOG 等 ${ecog} 例）${f.finalUnknownCount ? `，信息不足暂无法判断 ${f.finalUnknownCount} 例` : ""}，其余为不符合。`,
        `各步骤（符合／不符合／信息不足）：${f.steps.map(s => `${s.label} ${s.met}／${s.notMet}／${s.unknown}`).join("；")}。`,
      ].join("\n");
    }
    case "research_gap": {
      const g = res("gap_reasons"); const task = res("create_gap_task");
      if (!g.reasons.length || !task) return "当前快照的入组评估中没有“信息不足”的条目，无需补录。";
      const [top, ...rest] = g.reasons;
      return [
        `信息不足最主要的原因是「${top.reason}」，共 ${top.count} 人次（按漏斗步骤累计）。`,
        `补齐需要：${top.needed}。`,
        ...(rest.length ? [`其他原因：${rest.map(r => `「${r.reason}」${r.count} 人次（${r.needed}）`).join("；")}。`] : []),
        `已创建数据补录任务「${task.field}」，涉及 ${task.patientCount} 例，状态：待补录（可在治理端跟踪）。`,
      ].join("\n");
    }
    case "research_line_transition": {
      const t = res("line_transition");
      if (!t.n) return "快照中没有一线治疗记录，无法计算进入二线的比例。";
      return [
        `快照中有一线治疗记录的共 ${t.n} 例：进入二线 ${t.next_line} 例（占 ${pct1(t.nextLineRate)}%）；仍在一线治疗 ${t.on_treatment} 例；失访 ${t.lost} 例；死亡 ${t.deceased} 例；去向不明 ${t.unknown} 例。`,
        "（治疗线为规则推断；“去向不明”指一线已结束但无后续治疗或结局记录。）",
      ].join("\n");
    }
    case "generic_boundary": return GENERIC_BOUNDARY;
  }
}
