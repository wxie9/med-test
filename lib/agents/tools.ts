import { z } from "zod";
import guidelineData from "@/data/seed/guidelines.json";
import { getStore } from "@/lib/state/store";
import { now, today, newId } from "@/lib/state/clock";
import { applyFilter, latestBio, currentTreatments, lineLabel, lineGapStatus } from "@/lib/compute";
import { researchUseCase } from "@/lib/research/usecases";
import { buildFollowUpPlan } from "@/lib/plan/followup";
import { currentHer2, isHrPositive } from "@/lib/domain/her2";
import { stageLabel } from "@/lib/patient/display";
import { HER2_SHORT } from "@/lib/clinic/timeline";
import { CohortFilter, type DataGapTask, type Patient } from "@/lib/domain/types";
import type { AgentKind, ChatContext, ChatRequest, Citation, SharedToolState, ToolCallRecord } from "./types";

export type Guideline = (typeof guidelineData)[number];
const GUIDELINES: Guideline[] = guidelineData;
export const guidelineIds = () => new Set(GUIDELINES.map(g => g.id));
export function citationFor(id: string): Citation {
  const g = GUIDELINES.find(x => x.id === id);
  return { id, title: g?.source ?? "", version: g?.version ?? "" };
}
/** Fraction → percentage with one decimal (the only way a rate may be shown in a reply). */
export const pct1 = (x: number) => Math.round(x * 1000) / 10;

/** Every number a tool returned (recursively); fractions in [0,1] also contribute their 1-decimal percentage. */
export function collectToolNumbers(toolCalls: { result: unknown }[]): Set<number> {
  const out = new Set<number>();
  const walk = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) { out.add(v); if (v >= 0 && v <= 1) out.add(pct1(v)); }
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  toolCalls.forEach(c => walk(c.result));
  return out;
}

const TX: Record<Patient["treatments"][number]["type"], string> = { surgery: "手术", radiation: "放疗", chemo: "化疗", endocrine: "内分泌", anti_her2: "抗 HER2", cdk46: "CDK4/6 抑制剂", adc: "ADC", other: "其他" };
const INTENT: Record<Patient["treatments"][number]["intent"], string> = { neoadjuvant: "新辅助", adjuvant: "辅助", metastatic: "解救" };
const STOP: Record<Patient["treatments"][number]["stopReason"], string> = { completed: "完成", progression: "进展", toxicity: "毒性", patient_choice: "患者意愿", lost: "失访", death: "死亡", unknown: "原因不详", ongoing: "进行中" };
const BRCA: Record<Patient["genomics"]["brca"], string> = { positive: "突变", negative: "未见突变", not_tested: "未检测" };
/** What has to be collected to resolve each funnel "unknown" reason (keys are PROTOCOL_ADC_301 reasons). */
const NEEDED: Record<string, string> = {
  "缺 ER/PR 结果": "补录 ER、PR 免疫组化结果（原发或转移灶病理报告）",
  "IHC 2+ 缺 ISH 或结果未知": "补做或补录 HER2 ISH 检测结果，或 IHC 复核结果",
  "外院治疗缺日期": "补录外院 ADC 治疗的起止日期（外院病历或处方）",
  "数据源无 ECOG 字段": "最近一次就诊的 ECOG 体能评分（需研究中心现场核查）",
};
/** CTCAE v5.0 key points (paraphrased): [definition, handling] per grade 1..n. */
const CTCAE: Record<string, [string, string][]> = {
  "间质性肺病": [["无症状，仅影像学改变", "暂停 ADC，密切观察，影像好转后可恢复"], ["有症状，影响工具性日常活动，需医疗干预", "永久停用抗 HER2 ADC，给予糖皮质激素"], ["症状严重，影响自理活动，需吸氧", "永久停药，住院并给予大剂量糖皮质激素"], ["危及生命的呼吸功能障碍", "永久停药，紧急处理"]],
  "恶心": [["食欲下降，饮食习惯未改变", "继续治疗，饮食指导，按需止吐"], ["经口摄入减少，无明显体重下降、脱水或营养不良", "加强止吐方案，必要时暂停至降至 1 级"], ["经口热量或液体摄入不足，需鼻饲、肠外营养或住院", "暂停用药并补液支持，恢复后考虑减量"]],
  "中性粒细胞减少": [["低于正常下限至 1.5×10⁹/L", "继续治疗，按期复查血常规"], ["1.0–1.5×10⁹/L", "按说明书继续或暂停，下周期前复查"], ["0.5–1.0×10⁹/L", "暂停用药至恢复到 2 级或以下，考虑减量"], ["低于 0.5×10⁹/L", "暂停用药，评估感染风险，恢复后减量"]],
  "腹泻": [["较基线每日排便增加少于 4 次", "继续治疗，口服补液，按需止泻"], ["较基线每日排便增加 4–6 次", "止泻治疗，必要时暂停至降至 1 级"], ["较基线每日排便增加 7 次及以上，或需住院", "暂停用药并补液支持，恢复后减量"]],
  "关节痛": [["轻度疼痛", "继续治疗，运动及对症止痛"], ["中度疼痛，影响工具性日常活动", "对症治疗，评估是否换药"], ["重度疼痛，影响自理活动", "评估暂停或更换内分泌药物"]],
  "潮热": [["轻度症状，无需干预", "继续治疗，生活方式调整"], ["中度症状，影响工具性日常活动", "对症处理"], ["重度症状，影响自理活动", "评估调整用药"]],
  "周围神经病变": [["无症状，仅查体或检查发现", "继续治疗并观察"], ["中度症状，影响工具性日常活动", "考虑减量或暂停"], ["重度症状，影响自理活动", "暂停或停用相关药物"]],
  "乏力": [["经休息可缓解", "继续治疗"], ["休息不能缓解，影响工具性日常活动", "对症处理，必要时暂停"], ["休息不能缓解，影响自理活动", "暂停用药并评估原因"]],
};

function patientOf(id: string): Patient { const p = getStore().patients.get(id); if (!p) throw new Error("未找到该患者"); return p; }
function snapshotOf(id: string) { const s = getStore().snapshots.find(x => x.id === id); if (!s) throw new Error("未找到该研究快照"); return s; }
const STOP_WORDS = /[\s，。？！、,.?!；;：:（）()「」“”"'《》]+|的|对|和|与|是|什么|怎么|如何|吗|呢|哪些|推荐|指南|请问|能不能|有没有/;
/** Substring search over topic/text: terms (≥2 chars) score 2 in the topic, 1 in the text only; top 3, [] when nothing matches. */
function searchGuidelines(query: string) {
  const terms = query.toLowerCase().split(STOP_WORDS).map(t => t.trim()).filter(t => t.length >= 2);
  return GUIDELINES.map(g => ({ g, score: terms.reduce((s, t) => s + (g.topic.toLowerCase().includes(t) ? 2 : g.text.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.g.id.localeCompare(b.g.id)).slice(0, 3)
    .map(({ g }) => ({ id: g.id, topic: g.topic, text: g.text, source: g.source, version: g.version, population: g.population }));
}
function gapReasons(snapshotId: string) {
  const f = researchUseCase("feasibility", snapshotId);
  const m = new Map<string, number>();
  for (const s of f.steps) for (const [k, v] of Object.entries(s.unknownReasons)) m.set(k, (m.get(k) ?? 0) + v);
  return { n: f.summary.n, reasons: [...m].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count, needed: NEEDED[reason] ?? "核对原始病历并补录相关字段" })) };
}

type Bound = "patientId" | "snapshotId";
type JsonSchema = { type: "object"; properties: Record<string, unknown>; required: string[] };
type ToolDef<S extends z.ZodTypeAny, R> = { description: string; agents: AgentKind[]; schema: S; bound: Bound[]; parameters: JsonSchema; run: (args: z.infer<S>) => R };
const defineTool = <S extends z.ZodTypeAny, R>(t: ToolDef<S, R>) => t;
const noParams: JsonSchema = { type: "object", properties: {}, required: [] };
const PATIENT: AgentKind[] = ["patient", "doctor"];

export const TOOLS = {
  get_patient_summary: defineTool({
    description: "当前患者的结构化病历摘要：年龄、分期、受体、BRCA、研究同意、治疗事件、治疗线与当前治疗（不含姓名与编号）。",
    agents: PATIENT, schema: z.object({ patientId: z.string() }), bound: ["patientId"], parameters: noParams,
    run: ({ patientId }) => {
      const p = patientOf(patientId); const b = latestBio(p);
      return {
        age: p.age, stage: stageLabel(p.stage), hr: b ? (isHrPositive(b) ? "阳性" : "阴性") : "未知", her2: HER2_SHORT[currentHer2(p.biomarkers)],
        brca: BRCA[p.genomics.brca], consentResearch: p.consent.research,
        treatments: [...p.treatments].sort((x, y) => (x.start ?? "").localeCompare(y.start ?? "")).map(t => ({ type: TX[t.type], typeCode: t.type, intent: INTENT[t.intent], drug: t.drug, start: t.start, end: t.end, status: STOP[t.stopReason], source: t.source === "external" ? "外院" : "本院" })),
        lines: p.lines.map(l => ({ lineNo: l.lineNo, regimen: lineLabel(p, l.lineNo), start: l.start, end: l.end })),
        current: currentTreatments(p).map(t => ({ type: TX[t.type], typeCode: t.type, drug: t.drug })),
      };
    },
  }),
  get_followup_plan: defineTool({
    description: "当前患者接下来的随访计划（日期、项目、类型）。",
    agents: PATIENT, schema: z.object({ patientId: z.string() }), bound: ["patientId"], parameters: noParams,
    run: ({ patientId }) => buildFollowUpPlan(patientOf(patientId), today()),
  }),
  search_guidelines: defineTool({
    description: "检索指南要点库（CSCO 乳腺癌诊疗指南 2026 要点转述，待专家审阅）。query 用简短关键词，空格分隔；无命中返回 []。",
    agents: PATIENT, schema: z.object({ query: z.string() }), bound: [],
    parameters: { type: "object", properties: { query: { type: "string", description: "关键词，如 \"关节痛\"、\"HER2 低表达 ADC\"" } }, required: ["query"] },
    run: ({ query }) => searchGuidelines(query),
  }),
  ctcae_grade: defineTool({
    description: "查询某不良事件在 CTCAE v5.0 下指定级别的定义与处理要点。",
    agents: ["doctor"], schema: z.object({ symptom: z.string(), grade: z.number().int().min(1).max(5) }), bound: [],
    parameters: { type: "object", properties: { symptom: { type: "string", enum: Object.keys(CTCAE) }, grade: { type: "integer", minimum: 1, maximum: 5 } }, required: ["symptom", "grade"] },
    run: ({ symptom, grade }) => {
      const row = CTCAE[symptom]?.[grade - 1];
      return row ? { symptom, grade, definition: row[0], action: row[1], version: "CTCAE v5.0", found: true } : { symptom, grade, version: "CTCAE v5.0", found: false };
    },
  }),
  count_cohort: defineTool({
    description: "在当前研究快照内按筛选条件计数（仅返回计数）。",
    agents: ["research"], schema: z.object({ snapshotId: z.string(), filter: CohortFilter }), bound: ["snapshotId"],
    parameters: { type: "object", properties: { filter: { type: "object", description: "可选键：hrPositive(boolean)、her2(low|zero|positive 数组)、stage(early_adjuvant|metastatic|survivorship|lost|deceased 数组)、everMetastatic(boolean，曾远处转移)、priorCdk46(boolean)、intent、currentTreatmentType" } }, required: [] },
    run: ({ snapshotId, filter }) => { const s = snapshotOf(snapshotId); return { n: s.patients.length, matched: applyFilter(s.patients, filter).length, cutoff: s.cutoff }; },
  }),
  funnel: defineTool({
    description: "当前快照按 XX-ADC-301（虚构）方案的三态入组漏斗：各步骤符合/不符合/信息不足计数及原因（仅计数）。",
    agents: ["research"], schema: z.object({ snapshotId: z.string() }), bound: ["snapshotId"], parameters: noParams,
    run: ({ snapshotId }) => {
      const f = researchUseCase("feasibility", snapshotId);
      return {
        protocol: f.protocol, n: f.summary.n, finalMetCount: f.finalMetCount, finalUnknownCount: f.finalUnknownCount,
        steps: f.steps.map(({ label, met, notMet, unknown, unknownReasons }) => ({ label, met, notMet, unknown, unknownReasons })),
        pendingVerification: f.pendingVerification.map(({ label, count }) => ({ label, count })),
      };
    },
  }),
  gap_reasons: defineTool({
    description: "当前快照入组评估中“信息不足”的原因（按人次降序）及补齐所需数据。",
    agents: ["research"], schema: z.object({ snapshotId: z.string() }), bound: ["snapshotId"], parameters: noParams,
    run: ({ snapshotId }) => gapReasons(snapshotId),
  }),
  create_gap_task: defineTool({
    description: "为某个信息不足原因创建数据补录任务（每次提问最多一次）；field 必须是 gap_reasons 返回的 reason。",
    agents: ["research"], schema: z.object({ snapshotId: z.string(), field: z.string() }), bound: ["snapshotId"],
    parameters: { type: "object", properties: { field: { type: "string" } }, required: ["field"] },
    run: ({ snapshotId, field }): DataGapTask => {
      const r = gapReasons(snapshotId).reasons.find(x => x.reason === field); if (!r) throw new Error("未知的信息不足原因");
      const task: DataGapTask = { id: newId("gap"), source: snapshotId, field, patientCount: r.count, status: "open", createdAt: now() };
      getStore().gapTasks.push(task); return task;
    },
  }),
  line_transition: defineTool({
    description: "当前快照中第 lineNo 线治疗患者的去向：仍在治疗、进入下一线、失访、死亡、去向不明（计数与进入下一线比例）。",
    agents: ["research"], schema: z.object({ snapshotId: z.string(), lineNo: z.number().int().min(1).default(1) }), bound: ["snapshotId"],
    parameters: { type: "object", properties: { lineNo: { type: "integer", minimum: 1 } }, required: ["lineNo"] },
    run: ({ snapshotId, lineNo }) => {
      const s = snapshotOf(snapshotId); const g = lineGapStatus(s.patients, lineNo, s.cutoff);
      const n = g.on_treatment + g.next_line + g.lost + g.deceased + g.unknown;
      return { lineNo, n, ...g, nextLineRate: n ? g.next_line / n : 0 };
    },
  }),
};
export type ToolName = keyof typeof TOOLS;
export type ToolResult<N extends ToolName> = ReturnType<(typeof TOOLS)[N]["run"]>;
type AnyTool = { description: string; agents: AgentKind[]; schema: z.ZodTypeAny; bound: Bound[]; parameters: JsonSchema; run: (a: unknown) => unknown };
const isToolName = (n: string): n is ToolName => Object.prototype.hasOwnProperty.call(TOOLS, n);
export const toolsFor = (agent: AgentKind) => (Object.entries(TOOLS) as [ToolName, AnyTool][]).filter(([, t]) => t.agents.includes(agent)).map(([name, t]) => ({ name, description: t.description, parameters: t.parameters }));

/** Runs a tool with patientId/snapshotId forced from the request context (a model can never read outside its context). */
function execTool(name: string, rawArgs: unknown, ctx: ChatContext, shared?: SharedToolState): { args: Record<string, unknown>; result: unknown } {
  if (!isToolName(name)) throw new Error(`unknown tool ${name}`);
  const t = TOOLS[name] as unknown as AnyTool;
  const args: Record<string, unknown> = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? { ...(rawArgs as Record<string, unknown>) } : {};
  for (const k of t.bound) { const v = ctx[k]; if (!v) throw new Error(k === "patientId" ? "缺少患者上下文" : "缺少研究快照上下文"); args[k] = v; }
  if (name === "count_cohort" && args.filter === undefined) args.filter = ctx.filter ?? {};
  const parsed = t.schema.parse(args);
  if (name === "create_gap_task" && shared?.gapTask) return { args, result: shared.gapTask }; // one gap task per ask, even across a fallback
  const result = t.run(parsed);
  if (name === "create_gap_task" && shared) shared.gapTask = result;
  return { args, result };
}
export const runTool = (name: string, rawArgs: unknown, ctx: ChatContext, shared?: SharedToolState) => execTool(name, rawArgs, ctx, shared).result;

/** A per-request tool runner that only exposes the agent's tools and records every successful call. */
export function createToolSession(req: ChatRequest, shared: SharedToolState = {}) {
  const calls: ToolCallRecord[] = [];
  const allowed = new Set(toolsFor(req.agent).map(t => t.name as string));
  const call = (name: string, rawArgs: unknown = {}): unknown => {
    if (!allowed.has(name)) throw new Error(`tool ${name} not available`);
    const { args, result } = execTool(name, rawArgs, req.context, shared);
    calls.push({ name, args, result }); return result;
  };
  return { calls, call };
}
export type ToolSession = ReturnType<typeof createToolSession>;

const PRIVATE_KEYS = new Set(["finalMet", "finalUnknown", "patientIds"]);
/** Deep copy without patient-id lists (defence in depth: research tools already return counts only). */
export function clientSafe(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clientSafe);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !PRIVATE_KEYS.has(k)).map(([k, x]) => [k, clientSafe(x)]));
  return v;
}
export const clientToolCalls = (calls: ToolCallRecord[]): ToolCallRecord[] => calls.map(c => ({ name: c.name, args: clientSafe(c.args), result: clientSafe(c.result) }));
/** Citations for every guideline returned by search_guidelines calls. */
export function citationsFromCalls(calls: ToolCallRecord[]): Citation[] {
  const ids = new Set<string>();
  for (const c of calls) if (c.name === "search_guidelines" && Array.isArray(c.result)) for (const g of c.result as { id: string }[]) ids.add(g.id);
  return [...ids].map(citationFor);
}
/** Citations for every guideline id written in a model reply (unknown ids are kept so validation can reject them). */
export const citationsFromText = (text: string): Citation[] => [...new Set([...text.matchAll(/\bG-\d{3}\b/g)].map(m => m[0]))].map(citationFor);
