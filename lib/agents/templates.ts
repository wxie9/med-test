import { pct1, type ToolName, type ToolResult } from "./tools";
import type { AgentKind, ToolCallRecord } from "./types";
export type TemplateId =
  | "patient_emergency" | "patient_stop_med" | "patient_feedback" | "patient_next_visit" | "patient_research"
  | "doctor_summary" | "doctor_ctcae" | "doctor_draft" | "doctor_guideline"
  | "research_count" | "research_snapshot_size" | "research_gap" | "research_line_transition" | "research_boundary"
  | "generic_boundary";
export const GENERIC_BOUNDARY = "这个问题超出了演示助手的范围。您可以尝试下方的快捷问题，或联系您的医生/个案管理师。";
export const RESEARCH_BOUNDARY = "当前快照数据不支持回答该问题：本演示只提供描述性统计与入组可行性评估，不提供疗效或生存结论。";
const any = (...words: string[]) => (t: string) => words.some(w => t.includes(w.toUpperCase()));
const all = (...preds: ((t: string) => boolean)[]) => (t: string) => preds.every(p => p(t));
const not = (pred: (t: string) => boolean) => (t: string) => !pred(t);
/** Outcome / comparison questions the snapshot cannot answer (no efficacy or survival conclusions). Latin tokens need word boundaries (POSITIVE / DOSE are not OS). */
export const isResearchOutcomeQuestion = (t: string) => /\b(OS|PFS|ORR|DCR)\b/i.test(t) || /生存|疗效|有效率|缓解|肿瘤缩小|缩小肿瘤|疾病控制|治疗有效/.test(t);
const OUTCOME = isResearchOutcomeQuestion;
/** Severe symptoms: always the emergency template, in every mode. */
export const EMERGENCY_TEXT = "您描述的情况可能需要紧急处理：请立即前往最近医院急诊就诊，或拨打值班电话 021-0000-0000（演示），不要等待线上回复。就诊时请告诉医生您正在接受的乳腺癌治疗。";
const EMERGENCY = any("发热", "高烧", "出血", "呼吸困难", "胸痛", "意识");
/** Self-adjusting medication: explicit phrasings, or a medication noun together with a stop / skip / delay verb. */
const STOP_MED_PHRASES = ["停药", "停掉", "不吃", "减量", "减药", "剂量", "换药", "自己调", "关节痛", "少打", "少吃", "跳过", "推迟", "暂停", "不打", "漏服一次", "自己停"];
const MED_NOUN = any("药", "打针", "化疗", "输液", "来曲唑", "阿那曲唑", "依西美坦");
const STOP_VERB = any("停", "减", "换", "调", "少打", "少吃", "跳过", "推迟", "暂停", "不打", "不吃", "漏服一次", "自己停", "隔天服用");
const STOP_MED = (t: string) => any(...STOP_MED_PHRASES)(t) || (MED_NOUN(t) && STOP_VERB(t));
/** Templates answered without ever calling a model (short-circuit in every mode). */
export const SAFETY_TEMPLATES: ReadonlySet<TemplateId> = new Set(["patient_emergency", "patient_stop_med"]);
type Rule = { id: TemplateId; match: (upperText: string) => boolean; pages?: string[] };
/** Supported explicit transitions. Ambiguous, skipped or later lines have no demo answer. */
export function transitionLine(userText: string): 1 | 2 | undefined {
  const text = userText.normalize("NFKC").replace(/\s+/g, "");
  if (/不是|并非|还是|或者|分别|各自|和|及|、/.test(text)) return undefined;
  const refs = [...text.matchAll(/(?<!下)(?:第)?(\d+|[一二三四五六七八九十])线/g)];
  const value = (ref: RegExpMatchArray) => ({ 一: 1, 二: 2, 三: 3 }[ref[1]] ?? Number(ref[1]));
  const relation = /^(?:治疗)?(?:结束)?(?:后)?(?:进入|转入|转到|到|至)$/;
  if (refs.length === 2) {
    const source = value(refs[0]);
    const between = text.slice(refs[0].index! + refs[0][0].length, refs[1].index);
    if ((source === 1 || source === 2) && value(refs[1]) === source + 1 && relation.test(between) && !text.includes("下一线")) return source;
  }
  if (refs.length === 1) {
    const source = value(refs[0]), next = text.indexOf("下一线");
    if ((source === 1 || source === 2) && next > refs[0].index! && relation.test(text.slice(refs[0].index! + refs[0][0].length, next))) return source;
  }
  return undefined;
}
export const isLineQuestion = (text: string) => /(?:第)?(?:\d+|[一二三四五六七八九十])\s*线|下一线/.test(text.normalize("NFKC"));
/** First matching rule wins; order matters within an agent. research_gap is the only route that writes data, so it is the narrowest. */
const RULES: Record<AgentKind, Rule[]> = {
  patient: [
    { id: "patient_emergency", match: EMERGENCY },
    { id: "patient_stop_med", match: STOP_MED },
    { id: "patient_feedback", match: any("医生怎么说", "处理结果", "反馈") },
    { id: "patient_research", match: any("临床研究", "研究", "试验") },
    { id: "patient_next_visit", match: any("检查", "复查", "随访", "复诊") },
  ],
  doctor: [
    { id: "doctor_draft", match: all(any("起草", "草稿"), any("建议", "处理", "问卷", "症状")), pages: ["patient"] },
    { id: "doctor_ctcae", match: any("分级", "CTCAE", "不良事件"), pages: ["patient"] },
    { id: "doctor_summary", match: any("总结", "治疗经过"), pages: ["patient"] },
    { id: "doctor_guideline", match: any("指南") },
  ],
  research: [
    { id: "research_boundary", match: (t: string) => OUTCOME(t) || any("对比", "比较")(t) },
    { id: "research_line_transition", match: (t: string) => transitionLine(t) !== undefined },
    { id: "generic_boundary", match: isLineQuestion },
    { id: "research_count", match: all(any("符合"), any("多少", "比例", "数量"), not(OUTCOME)) },
    { id: "research_snapshot_size", match: (t: string) => /快照.*(共|有)多少例|样本量/.test(t) },
    { id: "research_gap", match: all(any("信息不足"), any("原因", "补齐", "补录")) },
    { id: "research_count", match: all(any("多少例"), not(OUTCOME)) },
  ],
};
export function pickTemplate(agent: AgentKind, page: string, userText: string): TemplateId {
  const text = userText.toUpperCase();
  return RULES[agent].find(r => (!r.pages || r.pages.includes(page)) && r.match(text))?.id ?? "generic_boundary";
}

/** Side-effect-free AE focus per current treatment class (first class present wins). */
const AE_FOCUS: [string, string[]][] = [["adc", ["间质性肺病", "恶心"]], ["cdk46", ["中性粒细胞减少", "腹泻"]], ["chemo", ["中性粒细胞减少", "周围神经病变"]], ["anti_her2", ["腹泻", "乏力"]], ["endocrine", ["关节痛", "潮热"]]];
type Call = (name: ToolName, args?: Record<string, unknown>) => unknown;
/** Guideline vocabulary picked out of a free-text question (Chinese has no word breaks); no hit → the raw question is the query. */
const GUIDELINE_TERMS = ["依从性", "内分泌", "关节痛", "骨密度", "骨健康", "CDK4/6", "HER2 低表达", "ADC", "ESR1", "PIK3CA", "BRCA", "PARP", "随访", "再活检", "临床研究", "间质性肺病", "恶心", "骨髓抑制", "CTCAE"];
/** Top 2 symptoms (grade ≥ 1) of the latest PRO. */
export const topSymptoms = (pro: ToolResult<"get_latest_pro">) => (pro?.symptoms ?? []).filter(x => x.grade >= 1).slice(0, 2);
/** The ongoing aromatase inhibitor, if any (letrozole / anastrozole / exemestane). */
const onAi = (s: ToolResult<"get_patient_summary">) => s.current.find(t => t.typeCode === "endocrine" && /唑|依西美坦/.test(t.drug ?? ""));
/** On ADC / chemo / CDK4/6 / anti-HER2 (nausea / fatigue rather than AI arthralgia). */
const activeSystemic = (s: ToolResult<"get_patient_summary">) => s.current.some(t => ["adc", "chemo", "cdk46", "anti_her2"].includes(t.typeCode));
/** Search terms for the patient's current therapy class(es): aromatase inhibitors → "AI", otherwise the class label (e.g. "ADC", "内分泌"). */
export const therapyTerms = (s: ToolResult<"get_patient_summary">) => [...new Set(s.current.map(t => (t.typeCode === "endocrine" && /唑|依西美坦/.test(t.drug ?? "") ? "AI" : t.type)))];
/** Runs the tools a template needs (patientId/snapshotId are bound from the request context by the tool session). */
export function runTemplateTools(id: TemplateId, call: Call, userText: string): void {
  switch (id) {
    case "patient_emergency": return;
    case "patient_feedback": call("get_latest_feedback"); call("get_followup_plan"); return;
    case "patient_stop_med": {
      const s = call("get_patient_summary") as ToolResult<"get_patient_summary">;
      call("search_guidelines", { query: onAi(s) ? "关节痛 停药" : activeSystemic(s) ? "不良反应 停药 恶心 乏力" : "不良反应 停药" }); return;
    }
    case "patient_next_visit": call("get_followup_plan"); call("search_guidelines", { query: "随访频率" }); return;
    case "patient_research": call("get_patient_summary"); call("search_guidelines", { query: "临床研究" }); return;
    case "doctor_summary": call("get_patient_summary"); return;
    case "doctor_ctcae": {
      // the patient's actual top PRO symptoms first, then the class-typical AEs; guideline search by those symptoms + current drug class
      const s = call("get_patient_summary") as ToolResult<"get_patient_summary">;
      const top = topSymptoms(call("get_latest_pro") as ToolResult<"get_latest_pro">).map(t => t.symptom);
      const focus = AE_FOCUS.find(([type]) => s.current.some(t => t.typeCode === type))?.[1] ?? [];
      for (const symptom of [...new Set([...top, ...focus])]) for (const grade of [1, 2, 3]) call("ctcae_grade", { symptom, grade });
      call("search_guidelines", { query: [...top, ...therapyTerms(s), "不良事件", "CTCAE"].join(" ") }); return;
    }
    case "doctor_draft": {
      const s = call("get_patient_summary") as ToolResult<"get_patient_summary">;
      const pro = call("get_latest_pro") as ToolResult<"get_latest_pro">;
      const top = topSymptoms(pro);
      for (const t of top) call("ctcae_grade", { symptom: t.symptom, grade: t.grade });
      if (top.length) call("search_guidelines", { query: [...top.map(t => t.symptom), ...therapyTerms(s)].join(" ") });
      return;
    }
    case "doctor_guideline": {
      const hits = GUIDELINE_TERMS.filter(t => userText.toUpperCase().includes(t.toUpperCase()));
      call("search_guidelines", { query: hits.length ? hits.join(" ") : userText }); return;
    }
    case "research_count": call("funnel"); return;
    case "research_snapshot_size": call("count_cohort", { filter: {} }); return;
    case "research_gap": {
      const g = call("gap_reasons") as ToolResult<"gap_reasons">;
      if (g.reasons.length) call("create_gap_task", { field: g.reasons[0].reason });
      return;
    }
    case "research_line_transition": {
      const lineNo = transitionLine(userText);
      if (lineNo !== undefined) call("line_transition", { lineNo });
      return;
    }
    case "research_boundary": case "generic_boundary": return;
  }
}

/** Renders a template; every number in the text is read from a tool result. */
export function renderTemplate(id: TemplateId, toolResults: ToolCallRecord[]): string {
  const res = <N extends ToolName>(name: N) => toolResults.find(c => c.name === name)?.result as ToolResult<N>;
  switch (id) {
    case "patient_emergency": return EMERGENCY_TEXT;
    case "patient_feedback": {
      const f = res("get_latest_feedback"); const plan = res("get_followup_plan");
      if (!f) return "目前还没有医生对您报告的处理反馈。个案管理师处理后会通过“消息”通知您；如有不适加重，请及时联系或就诊。";
      const arranged = plan.filter(i => i.title.endsWith("（医生安排）"));
      return [`医生最近的反馈（${f.date} · ${f.kind}）：${f.text}`, ...(arranged.length ? [`已加入您的随访计划：${arranged.map(i => `${i.due} ${i.title}`).join("；")}。`] : []), "如有疑问，请在“消息”中联系个案管理师。"].join("\n");
    }
    case "patient_stop_med": {
      const s = res("get_patient_summary");
      const ai = onAi(s);
      const active = activeSystemic(s);
      const first = ai ? `关节痛是${ai.drug}这类芳香化酶抑制剂较常见的不适，多数通过规律运动、热敷或对症止痛能够缓解。`
        : active ? "治疗期间出现恶心、乏力等不适较常见，多数可以通过止吐、休息、营养支持等对症处理缓解。"
        : "用药期间出现不适较常见，多数可以通过对症处理缓解。";
      return [
        first,
        "请不要自行停药、减量、少打或推迟治疗——是否需要调整用药，必须由医生确认。",
        "建议您：① 在“问卷”里如实记录不适的程度；② 下次门诊时告诉医生，医生会评估对症处理或调整方案；③ 如果症状明显影响进食、睡眠或日常活动，请通过“消息”联系个案管理师，提前安排门诊；出现发热、出血、呼吸困难等情况请立即到急诊就诊。",
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
      const s = res("get_patient_summary"); const pro = res("get_latest_pro"); const top = topSymptoms(pro);
      const hits = res("search_guidelines") ?? [];
      const grades = toolResults.filter(c => c.name === "ctcae_grade").map(c => c.result as ToolResult<"ctcae_grade">).filter(g => g.found);
      const symptoms = [...new Set(grades.map(g => g.symptom))];
      const cur = s.current.length ? s.current.map(t => `${t.type}${t.drug ? `（${t.drug}）` : ""}`).join("、") : null;
      const body = symptoms.map(sym => `· ${sym}：${grades.filter(g => g.symptom === sym).map(g => `${g.grade} 级 ${g.definition}（处理：${g.action}）`).join("；")}`);
      return [
        cur ? `当前线治疗：${cur}。建议按 CTCAE v5.0 重点记录：` : "当前无进行中的系统治疗，按 CTCAE v5.0 记录的通用要求如下：",
        ...(pro && top.length ? [`最近一次问卷（${pro.date}）报告：${top.map(t => `${t.symptom} ${t.grade} 级`).join("、")}。`] : []),
        ...body,
        "记录要求：注明发生日期、最高级别、与药物的相关性、采取的措施（继续/暂停/减量/停药）及转归。",
        ...(hits.length ? [`相关指南要点：${hits.map(h => `[${h.id}] ${h.topic}`).join("；")}。`] : []),
      ].join("\n");
    }
    case "doctor_draft": {
      const pro = res("get_latest_pro");
      if (!pro) return "该患者尚无问卷记录，无法起草症状处理建议。";
      const top = topSymptoms(pro);
      if (!top.length) return `最近一次问卷（${pro.date} · ${pro.scale}）各项症状均未达到 1 级，暂无需处理的症状。以上为草稿，需医生确认。`;
      const hits = res("search_guidelines") ?? [];
      const grades = toolResults.filter(c => c.name === "ctcae_grade").map(c => c.result as ToolResult<"ctcae_grade">);
      const relevant = hits.filter(h => top.some(t => h.topic.includes(t.symptom) || h.text.includes(t.symptom)));
      const bullet = (sym: string, grade: number) => {
        const g = grades.find(x => x.symptom === sym && x.grade === grade && x.found);
        if (g?.found) return `${g.action}（参考 CTCAE v5.0 ${grade} 级：${g.definition}）`;
        const hit = hits.find(h => h.topic.includes(sym) || h.text.includes(sym));
        return hit ? `参考 [${hit.id}] ${hit.topic}：${hit.text}` : "对症处理，下次随访时复评";
      };
      return [
        `根据最近一次问卷（${pro.date} · ${pro.scale}），症状处理建议草稿：`,
        ...top.map(t => `· ${t.symptom}（${t.grade} 级）→ ${bullet(t.symptom, t.grade)}`),
        ...(hits.length ? [`相关指南要点：${(relevant.length ? relevant : hits).map(h => `[${h.id}] ${h.topic}`).join("；")}。`] : []),
        "以上为草稿，需医生确认。",
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
    case "research_snapshot_size": {
      const c = res("count_cohort");
      return `当前快照共 ${c.n} 例（数据截止 ${c.cutoff}）。快照创建后冻结，该人数与数据治理台快照卡片、研究门户概览页的 n 一致。`;
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
      if (!t) return GENERIC_BOUNDARY;
      const labels = ["", "一线", "二线", "三线"];
      const source = labels[t.lineNo] ?? `第 ${t.lineNo} 线`, next = labels[t.lineNo + 1] ?? `第 ${t.lineNo + 1} 线`;
      if (!t.n) return `快照中没有${source}治疗记录，无法计算进入${next}的比例。`;
      return [
        `快照中有${source}治疗记录的共 ${t.n} 例：进入${next} ${t.next_line} 例（占 ${pct1(t.nextLineRate)}%）；仍在${source}治疗 ${t.on_treatment} 例；失访 ${t.lost} 例；死亡 ${t.deceased} 例；去向不明 ${t.unknown} 例。`,
        `（治疗线为规则推断；“去向不明”指${source}已结束但无后续治疗或结局记录。）`,
      ].join("\n");
    }
    case "research_boundary": return RESEARCH_BOUNDARY;
    case "generic_boundary": return GENERIC_BOUNDARY;
  }
}
