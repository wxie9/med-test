import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chat } from "@/lib/agents/adapter";
import { validateResponse } from "@/lib/agents/validate";
import { collectToolNumbers, guidelineIds, runTool } from "@/lib/agents/tools";
import { pickTemplate } from "@/lib/agents/templates";
import { quickQuestions } from "@/lib/agents/quickQuestions";
import { resetStore, getStore } from "@/lib/state/store";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
import type { ChatRequest, ToolCallRecord } from "@/lib/agents/types";
import guidelines from "@/data/seed/guidelines.json";
const PATIENT_ID = /\bP-[A-Z0-9]{1,4}\b/;
const clearEnv = () => { for (const k of ["DEMO_CLAUDE_API_KEY", "DEMO_OPENAI_API_KEY", "DEMO_OPENAI_BASE_URL", "DEMO_OPENAI_MODEL"]) delete process.env[k]; };
const metSnapshot = () => { const c = createCohort("a", { stage: ["metastatic"] }, "x"); submitCohort(c.id); return createSnapshot(c.id, "2026-10-13"); };
describe("agents", () => {
  beforeEach(() => { resetStore(); delete process.env.DEMO_CLAUDE_API_KEY; delete process.env.DEMO_OPENAI_API_KEY; });
  afterEach(clearEnv);
  it("deterministic patient assistant refuses stop-medication and routes to doctor", async () => {
    const r = await chat({ agent: "patient", messages: [{ role: "user", content: "我最近关节痛，能不能先停药？" }], context: { patientId: "P-A", page: "assistant" } });
    expect(r.mode).toBe("deterministic"); expect(r.text).toMatch(/医生确认|门诊/); expect(r.text).not.toMatch(/可以停药/);
  });
  it("research assistant numbers come from tools and differ by snapshot", async () => {
    const c1 = createCohort("a", { stage: ["metastatic"] }, "x"); submitCohort(c1.id); const s1 = createSnapshot(c1.id, "2026-10-13");
    const c2 = createCohort("b", { stage: ["early_adjuvant"] }, "x"); submitCohort(c2.id); const s2 = createSnapshot(c2.id, "2026-10-13");
    const r1 = await chat({ agent: "research", messages: [{ role: "user", content: "符合已知条件的有多少例？" }], context: { snapshotId: s1.id, page: "feasibility" } });
    const r2 = await chat({ agent: "research", messages: [{ role: "user", content: "符合已知条件的有多少例？" }], context: { snapshotId: s2.id, page: "feasibility" } });
    expect(r1.toolCalls[0].name).toBe("funnel"); expect(r1.text).not.toBe(r2.text);
  });
  it("gap question creates a DataGapTask", async () => {
    const c = createCohort("a", { stage: ["metastatic"] }, "x"); submitCohort(c.id); const s = createSnapshot(c.id, "2026-10-13");
    await chat({ agent: "research", messages: [{ role: "user", content: "信息不足中最主要的原因是什么，补齐需要什么数据？" }], context: { snapshotId: s.id, page: "feasibility" } });
    expect(getStore().gapTasks.length).toBe(1);
  });
  it("doctor assistant says 未找到依据 when guideline search is empty", async () => {
    const r = await chat({ agent: "doctor", messages: [{ role: "user", content: "指南对火星人乳腺癌的推荐？" }], context: { patientId: "P-B", page: "patient" } });
    expect(r.text).toMatch(/未找到依据/);
  });
  it("validateResponse rejects unknown citation and fabricated number", () => {
    expect(validateResponse({ text: "共 999 例", citations: [{ id: "G-404", title: "", version: "" }], toolCalls: [] }, new Set(["G-001"]), new Set([12])).ok).toBe(false);
  });
  it("provider failure degrades within 8s and keeps conversation", async () => {
    process.env.DEMO_OPENAI_API_KEY = "bad"; process.env.DEMO_OPENAI_BASE_URL = "http://127.0.0.1:9"; process.env.DEMO_OPENAI_MODEL = "x";
    const t = Date.now(); const r = await chat({ agent: "patient", messages: [{ role: "user", content: "下次要做什么检查？" }], context: { patientId: "P-A", page: "assistant" } });
    expect(Date.now() - t).toBeLessThan(8000); expect(r.mode).toBe("deterministic"); expect(r.degraded).toBeTruthy();
  });
});

describe("agents: guideline knowledge base and tools", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  it("has 30 reviewed=false CSCO 2026 entries with unique ids and no number-unit claims", () => {
    expect(guidelines).toHaveLength(30);
    expect(guidelineIds().size).toBe(30);
    for (const g of guidelines) {
      expect(g).toMatchObject({ source: "CSCO 乳腺癌诊疗指南", version: "2026", reviewed: false });
      expect(g.id).toMatch(/^G-0\d\d$/);
      expect(`${g.topic}${g.text}`).not.toMatch(/\d+(?:\.\d+)?\s*(例|人|%)/); // guideline text never trips the number validator
    }
  });
  it("search_guidelines matches by topic/text substring and returns [] for no match", () => {
    const hit = runTool("search_guidelines", { query: "CDK4/6 后 HER2 低表达" }, { page: "x" }) as { id: string }[];
    expect(hit.length).toBeGreaterThan(0);
    expect(runTool("search_guidelines", { query: "火星人乳腺癌" }, { page: "x" })).toEqual([]);
  });
  it("collectToolNumbers collects nested numbers and 1-decimal percentages of fractions", () => {
    const s = collectToolNumbers([{ name: "x", args: {}, result: { a: 12, b: [{ c: 0.487 }], d: "7" } }] as ToolCallRecord[]);
    expect(s.has(12)).toBe(true); expect(s.has(0.487)).toBe(true); expect(s.has(48.7)).toBe(true); expect(s.has(7)).toBe(false);
  });
  it("validateResponse rejects patient ids in the reply and accepts tool-backed numbers", () => {
    expect(validateResponse({ text: "P-0012 符合", citations: [], toolCalls: [] }, new Set(), new Set()).ok).toBe(false);
    expect(validateResponse({ text: "共 12 例，占 48.7%", citations: [{ id: "G-001" }], toolCalls: [] }, new Set(["G-001"]), new Set([12, 48.7])).ok).toBe(true);
  });
  it("patient tools are bound to the request context (model cannot read another patient)", () => {
    const r = runTool("get_patient_summary", { patientId: "P-B" }, { patientId: "P-A", page: "assistant" }) as { stage: string; age: number };
    expect(r.stage).toContain("早期"); expect(r.age).toBe(getStore().patients.get("P-A")!.age);
  });
  it("pickTemplate routes by keyword and falls back to generic_boundary", () => {
    expect(pickTemplate("patient", "assistant", "参加临床研究需要注意什么？")).toBe("patient_research");
    expect(pickTemplate("research", "feasibility", "一线后进入二线的比例？")).toBe("research_line_transition");
    expect(pickTemplate("patient", "assistant", "今天天气怎么样")).toBe("generic_boundary");
  });
});

describe("agents: every quick question works deterministically and passes validation", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  it("every context's quick questions reply, cite only known guidelines, use only tool numbers, and leak no patient ids", async () => {
    const snap = metSnapshot();
    const cases: [ChatRequest["agent"], ChatRequest["context"], string[]][] = [
      ["patient", { patientId: "P-A", page: "assistant" }, quickQuestions("patient", "early_adjuvant")],
      ["patient", { patientId: "P-B", page: "assistant" }, quickQuestions("patient", "metastatic")],
      ["doctor", { patientId: "P-A", page: "patient" }, quickQuestions("doctor", "early_adjuvant")],
      ["doctor", { patientId: "P-B", page: "patient" }, quickQuestions("doctor", "metastatic")],
      ["research", { snapshotId: snap.id, page: "feasibility" }, quickQuestions("research")],
    ];
    for (const [agent, ctx, qs] of cases) {
      for (const q of qs) {
        const r = await chat({ agent, messages: [{ role: "user", content: q }], context: ctx });
        expect(r.mode).toBe("deterministic");
        expect(r.text.length).toBeGreaterThan(10);
        expect(r.text).not.toBe("这个问题超出了演示助手的范围。您可以尝试下方的快捷问题，或联系您的医生/个案管理师。");
        expect(r.text).not.toMatch(PATIENT_ID);
        expect(validateResponse(r, guidelineIds(), collectToolNumbers(r.toolCalls))).toEqual({ ok: true });
        if (agent === "research") expect(JSON.stringify(r.toolCalls)).not.toMatch(PATIENT_ID);
      }
    }
  });
  it("generic_boundary text is exact", async () => {
    const r = await chat({ agent: "patient", messages: [{ role: "user", content: "今天天气怎么样" }], context: { patientId: "P-A", page: "assistant" } });
    expect(r.text).toBe("这个问题超出了演示助手的范围。您可以尝试下方的快捷问题，或联系您的医生/个案管理师。");
  });
  it("gap question records field = top unknown reason and patientCount = its count; each ask creates exactly one task", async () => {
    const snap = metSnapshot();
    const ask = () => chat({ agent: "research", messages: [{ role: "user", content: "信息不足中最主要的原因是什么，补齐需要什么数据？" }], context: { snapshotId: snap.id, page: "feasibility" } });
    const r = await ask();
    const reasons = new Map<string, number>();
    const gap = r.toolCalls.find(c => c.name === "gap_reasons")!.result as { reasons: { reason: string; count: number }[] };
    for (const x of gap.reasons) reasons.set(x.reason, x.count);
    const top = [...reasons].sort((a, b) => b[1] - a[1])[0];
    expect(getStore().gapTasks[0]).toMatchObject({ source: snap.id, field: top[0], patientCount: top[1], status: "open" });
    expect(r.text).toContain(top[0]);
    await ask(); expect(getStore().gapTasks).toHaveLength(2);
  });
});

type FetchArgs = [string, { body: string; headers: Record<string, string>; signal?: AbortSignal }];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
describe("agents: provider adapters with mocked fetch", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  afterEach(() => { vi.unstubAllGlobals(); clearEnv(); });
  const openaiEnv = () => { process.env.DEMO_OPENAI_API_KEY = "k"; process.env.DEMO_OPENAI_BASE_URL = "http://llm.test/v1/"; process.env.DEMO_OPENAI_MODEL = "m"; };
  const patientReq: ChatRequest = { agent: "patient", messages: [{ role: "user", content: "下次要做什么检查？" }], context: { patientId: "P-A", page: "assistant" } };
  it.each([401, 429, 500])("HTTP %i degrades to deterministic", async status => {
    openaiEnv(); vi.stubGlobal("fetch", vi.fn(async () => json({ error: "x" }, status)));
    const r = await chat(patientReq);
    expect(r.mode).toBe("deterministic"); expect(r.detail).toContain(String(status)); expect(r.text.length).toBeGreaterThan(10);
    expect(r.degraded).toBe(`已切换至本地演示模式（${status === 401 ? "鉴权失败（401/403）" : status === 429 ? "请求过于频繁（429）" : "网络错误"}）`);
  });
  it("timeout degrades with 超时", async () => {
    openaiEnv();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }));
    const r = await chat(patientReq);
    expect(r.degraded).toContain("超时");
  });
  it("openai function calling: tool round then validated text → mode openai, context-bound args", async () => {
    openaiEnv();
    const fetchMock = vi.fn(async (...args: FetchArgs) => {
      const body = JSON.parse(args[1].body) as { messages: { role: string }[]; tools: unknown[] };
      expect(args[0]).toBe("http://llm.test/v1/chat/completions");
      expect(args[1].headers.authorization).toBe("Bearer k");
      expect(body.tools.length).toBeGreaterThan(0);
      if (!body.messages.some(m => m.role === "tool")) return json({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_followup_plan", arguments: JSON.stringify({ patientId: "P-B" }) } }] } }] });
      return json({ choices: [{ message: { role: "assistant", content: "下次请按计划完成每月问卷，并按时复查。" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await chat(patientReq);
    expect(r.mode).toBe("openai"); expect(r.degraded).toBeUndefined(); expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.toolCalls[0]).toMatchObject({ name: "get_followup_plan", args: { patientId: "P-A" } });
  });
  it("invalid model output (fabricated number) degrades; a gap task created before the failure is not duplicated by the fallback", async () => {
    openaiEnv(); const snap = metSnapshot();
    vi.stubGlobal("fetch", vi.fn(async (...args: FetchArgs) => {
      const body = JSON.parse(args[1].body) as { messages: { role: string }[] };
      if (!body.messages.some(m => m.role === "tool")) return json({ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "create_gap_task", arguments: JSON.stringify({ field: "数据源无 ECOG 字段" }) } }] } }] });
      return json({ choices: [{ message: { role: "assistant", content: "共 99999 例缺少 ECOG。" } }] });
    }));
    const r = await chat({ agent: "research", messages: [{ role: "user", content: "信息不足中最主要的原因是什么，补齐需要什么数据？" }], context: { snapshotId: snap.id, page: "feasibility" } });
    expect(r.mode).toBe("deterministic"); expect(r.degraded).toBe("已切换至本地演示模式（输出未通过校验）"); expect(r.detail).toMatch(/99999/);
    expect(getStore().gapTasks).toHaveLength(1);
  });
  it("unknown citation and patient id in model output degrade", async () => {
    openaiEnv();
    for (const content of ["参考 G-999 的建议。", "与 P-0001 情况类似。"]) {
      vi.stubGlobal("fetch", vi.fn(async () => json({ choices: [{ message: { role: "assistant", content } }] })));
      const r = await chat(patientReq); expect(r.mode).toBe("deterministic"); expect(r.degraded).toBeTruthy();
    }
  });
  it("claude messages API with tool_use round → mode claude with known citation", async () => {
    process.env.DEMO_CLAUDE_API_KEY = "ck";
    const fetchMock = vi.fn(async (...args: FetchArgs) => {
      expect(args[0]).toBe("https://api.anthropic.com/v1/messages");
      expect(args[1].headers["x-api-key"]).toBe("ck"); expect(args[1].headers["anthropic-version"]).toBe("2023-06-01");
      const body = JSON.parse(args[1].body) as { model: string; max_tokens: number; messages: { role: string; content: unknown }[] };
      expect(body.model).toBe("claude-sonnet-5-5"); expect(body.max_tokens).toBe(800);
      if (body.messages.length === 1) return json({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "search_guidelines", input: { query: "骨健康" } }] });
      return json({ stop_reason: "end_turn", content: [{ type: "text", text: "请补充钙剂与维生素 D，并按时复查骨密度（G-009）。" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await chat({ agent: "patient", messages: [{ role: "user", content: "骨健康要注意什么" }], context: { patientId: "P-A", page: "assistant" } });
    expect(r.mode).toBe("claude"); expect(r.citations.map(c => c.id)).toEqual(["G-009"]); expect(r.toolCalls[0].name).toBe("search_guidelines");
  });
});

describe("agents: fix round 1 — research routing boundaries", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  const ask = (snapshotId: string, content: string) => chat({ agent: "research", messages: [{ role: "user", content }], context: { snapshotId, page: "feasibility" } });
  it("不符合的主要原因 creates no gap task and is not the gap answer", async () => {
    const s = metSnapshot(); const r = await ask(s.id, "不符合的主要原因是什么？");
    expect(getStore().gapTasks).toHaveLength(0); expect(r.text).not.toMatch(/补录任务|信息不足最主要/);
    expect(r.toolCalls.map(c => c.name)).not.toContain("create_gap_task");
    expect(pickTemplate("research", "feasibility", "数据缺失的原因？")).not.toBe("research_gap");
    expect(pickTemplate("research", "feasibility", "信息不足需要补录哪些数据？")).toBe("research_gap");
  });
  it("符合已知条件的比例 is not the line-transition answer", async () => {
    const s = metSnapshot(); const r = await ask(s.id, "符合已知条件的比例？");
    expect(r.toolCalls.map(c => c.name)).not.toContain("line_transition"); expect(r.text).not.toMatch(/进入二线/);
    expect(pickTemplate("research", "feasibility", "进入下一线的有多少？")).toBe("research_line_transition");
  });
  it("outcome / comparison questions get research_boundary with zero tool calls", async () => {
    const s = metSnapshot(); const r = await ask(s.id, "有多少例患者 OS 超过 2 年？");
    expect(r.text).toBe("当前快照数据不支持回答该问题：本演示只提供描述性统计与入组可行性评估，不提供疗效或生存结论。");
    expect(r.toolCalls).toHaveLength(0);
    for (const q of ["符合条件的患者 PFS 多少？", "两组有效率对比", "符合的有多少例缓解？"]) expect(pickTemplate("research", "feasibility", q)).toBe("research_boundary");
  });
});

describe("agents: fix round 1 — stop-medication guard", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  afterEach(() => { vi.unstubAllGlobals(); clearEnv(); });
  it("widened keywords: 减量 question returns the boundary routing to the doctor", async () => {
    const r = await chat({ agent: "patient", messages: [{ role: "user", content: "药能不能减量，要复查吗？" }], context: { patientId: "P-A", page: "assistant" } });
    expect(r.text).toMatch(/医生确认|门诊/); expect(r.text).not.toMatch(/可以(先|直接)?(停药|减量|换药|停掉)/);
    for (const q of ["这个药可以停掉吗", "我想不吃了", "剂量能不能小一点", "能换药吗", "我自己调一下用量"]) expect(pickTemplate("patient", "assistant", q)).toBe("patient_stop_med");
  });
  it("with a key configured, the stop-med question never calls the provider (guarded, mode stays configured)", async () => {
    process.env.DEMO_CLAUDE_API_KEY = "ck"; const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await chat({ agent: "patient", messages: [{ role: "user", content: "我最近关节痛，能不能先停药？" }], context: { patientId: "P-A", page: "assistant" } });
    expect(f).not.toHaveBeenCalled(); expect(r.guarded).toBe(true); expect(r.mode).toBe("claude"); expect(r.degraded).toBeUndefined();
    expect(r.text).toMatch(/医生确认/);
  });
  it("a patient-agent model reply that permits stopping medication degrades", async () => {
    process.env.DEMO_OPENAI_API_KEY = "k"; process.env.DEMO_OPENAI_BASE_URL = "http://llm.test/v1"; process.env.DEMO_OPENAI_MODEL = "m";
    vi.stubGlobal("fetch", vi.fn(async () => json({ choices: [{ message: { role: "assistant", content: "可以先停药观察" } }] })));
    const r = await chat({ agent: "patient", messages: [{ role: "user", content: "下次要做什么检查？" }], context: { patientId: "P-A", page: "assistant" } });
    expect(r.mode).toBe("deterministic"); expect(r.degraded).toBe("已切换至本地演示模式（输出未通过校验）"); expect(r.text).not.toMatch(/可以先停药/);
  });
  it("missing config maps to 配置缺失", async () => {
    process.env.DEMO_OPENAI_API_KEY = "k"; const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await chat({ agent: "patient", messages: [{ role: "user", content: "下次要做什么检查？" }], context: { patientId: "P-A", page: "assistant" } });
    expect(r.degraded).toBe("已切换至本地演示模式（配置缺失）"); expect(r.detail).toMatch(/DEMO_OPENAI_MODEL/); expect(f).not.toHaveBeenCalled();
  });
});

describe("agents: doctor_draft (A4 建议草稿)", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  const ask = (patientId: string) => chat({ agent: "doctor", messages: [{ role: "user", content: "根据最近一次问卷起草症状处理建议" }], context: { patientId, page: "patient" } });
  it("drafts from the latest PRO's top 2 symptoms with CTCAE handling and guideline citations; numbers only from tools", async () => {
    expect(pickTemplate("doctor", "patient", "根据最近一次问卷起草症状处理建议")).toBe("doctor_draft");
    const r = await ask("P-B");
    expect(r.text).toMatch(/^根据最近一次问卷（2026-10-06 · 每周治疗症状问卷）/);
    expect(r.text).toContain("· 恶心（2 级）→"); expect(r.text).toContain("· 乏力（2 级）→"); expect(r.text).not.toContain("口腔炎（");
    expect(r.text.trim().endsWith("以上为草稿，需医生确认。")).toBe(true);
    expect(r.citations.length).toBeGreaterThan(0); expect(r.citations.map(c => c.id)).toContain("G-017");
    const q = r.toolCalls.find(c => c.name === "search_guidelines")!.args as { query: string };
    expect(q.query).toBe("恶心 乏力 ADC"); // the patient's actual top symptoms + current therapy class
    expect(validateResponse(r, guidelineIds(), collectToolNumbers(r.toolCalls))).toEqual({ ok: true });
  });
  it("follows a newly submitted PRO (P-A 关节痛 2 / 潮热 2 → AI arthralgia guidance)", async () => {
    const { submitPro } = await import("@/lib/pro/submit");
    submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 2, 潮热: 2, 情绪: 0, 睡眠: 0 }, flags: { missedDoses14d: 5, stopIntent: true } });
    const r = await ask("P-A");
    expect(r.text).toContain("· 关节痛（2 级）→"); expect(r.text).toContain("· 潮热（2 级）→");
    expect(r.citations.map(c => c.id)).toEqual(["G-004", "G-005", "G-006"]); // AI arthralgia entries (letrozole → "AI")
    expect((r.toolCalls.find(c => c.name === "search_guidelines")!.args as { query: string }).query).toBe("关节痛 潮热 AI");
  });
});

describe("agents: research_snapshot_size (统计一致: assistant == snapshot n)", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  it("routes 快照…多少例 / 样本量 and answers the snapshot n with its cutoff via count_cohort({})", async () => {
    for (const q of ["当前快照共有多少例？", "这个快照有多少例", "样本量是多少"]) expect(pickTemplate("research", "feasibility", q)).toBe("research_snapshot_size");
    expect(pickTemplate("research", "feasibility", "符合已知条件的有多少例？")).toBe("research_count");
    const snap = metSnapshot();
    const r = await chat({ agent: "research", messages: [{ role: "user", content: "当前快照共有多少例？" }], context: { snapshotId: snap.id, page: "feasibility" } });
    expect(r.text).toMatch(new RegExp(`^当前快照共 ${snap.patients.length} 例（数据截止 2026-10-13）`));
    expect(r.toolCalls).toEqual([{ name: "count_cohort", args: { snapshotId: snap.id, filter: {} }, result: { n: snap.patients.length, matched: snap.patients.length, cutoff: "2026-10-13" } }]);
    const { researchUseCase } = await import("@/lib/research/usecases");
    expect(researchUseCase("overview", snap.id).n).toBe(snap.patients.length);
  });
});

describe("agents: F8 quick questions bound to context", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  it("patient / doctor lists follow the stage; research has four; 参加临床研究需要注意什么？ is offered at every stage", () => {
    expect(quickQuestions("patient", "early_adjuvant")).toEqual(["我最近关节痛，能不能先停药？", "下次要做什么检查？", "参加临床研究需要注意什么？"]);
    expect(quickQuestions("patient", "survivorship")).toEqual(quickQuestions("patient", "early_adjuvant"));
    expect(quickQuestions("patient", "metastatic")).toEqual(["最近恶心乏力明显，能不能少打一次？", "下次要做什么检查？", "参加临床研究需要注意什么？"]);
    expect(quickQuestions("doctor", "early_adjuvant")).toEqual(["总结这位患者的治疗经过", "根据最近一次问卷起草症状处理建议", "辅助内分泌治疗依从性差时指南建议是什么？"]);
    expect(quickQuestions("doctor", "metastatic")).toEqual(["总结这位患者的治疗经过", "当前线不良事件按 CTCAE 如何分级记录？", "指南对 CDK4/6 后 HER2 低表达的推荐是什么？"]);
    expect(quickQuestions("research")).toEqual(["信息不足中最主要的原因是什么，补齐需要什么数据？", "符合已知条件的有多少例？", "一线后进入二线的比例？", "当前快照共有多少例？"]);
    for (const st of ["early_adjuvant", "metastatic", "survivorship", "lost", "deceased"] as const) expect(quickQuestions("patient", st)).toContain("参加临床研究需要注意什么？");
  });
  it("the metastatic patient question is answered by the safety template; the early doctor guideline question cites the adherence entry", async () => {
    const r = await chat({ agent: "patient", messages: [{ role: "user", content: "最近恶心乏力明显，能不能少打一次？" }], context: { patientId: "P-B", page: "assistant" } });
    expect(r.text).toMatch(/医生确认/); expect(r.text).toMatch(/恶心、乏力/);
    const g = await chat({ agent: "doctor", messages: [{ role: "user", content: "辅助内分泌治疗依从性差时指南建议是什么？" }], context: { patientId: "P-A", page: "patient" } });
    expect(g.citations[0].id).toBe("G-002"); expect(g.text).toContain("[G-002] 辅助内分泌依从性");
  });
  it("CTCAE searches by the patient's actual top symptoms and current drug class", async () => {
    const r = await chat({ agent: "doctor", messages: [{ role: "user", content: "当前线不良事件按 CTCAE 如何分级记录？" }], context: { patientId: "P-B", page: "patient" } });
    const q = (r.toolCalls.find(c => c.name === "search_guidelines")!.args as { query: string }).query;
    expect(q).toBe("恶心 乏力 ADC 不良事件 CTCAE");
    expect(r.text).toContain("最近一次问卷（2026-10-06）报告：恶心 2 级、乏力 2 级。");
    expect(r.text).toContain("· 乏力："); expect(r.text).toContain("· 间质性肺病：");
    const { submitPro } = await import("@/lib/pro/submit");
    submitPro({ patientId: "P-B", scaleId: "treatment_weekly_v1", items: { 恶心: 0, 乏力: 0, 口腔炎: 0, 腹泻: 3, 手足综合征: 0, 发热: 0 }, flags: {} });
    const r2 = await chat({ agent: "doctor", messages: [{ role: "user", content: "当前线不良事件按 CTCAE 如何分级记录？" }], context: { patientId: "P-B", page: "patient" } });
    expect((r2.toolCalls.find(c => c.name === "search_guidelines")!.args as { query: string }).query).toBe("腹泻 ADC 不良事件 CTCAE");
  });
});

describe("agents: F10 clinician follow-up reaches the patient", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  it("get_followup_plan includes the task created on close; 医生怎么说 answers with the latest feedback (no ids)", async () => {
    const { submitPro } = await import("@/lib/pro/submit"); const { actOnAlert, closeAlertWithTask } = await import("@/lib/clinic/actions");
    const ask = () => chat({ agent: "patient", messages: [{ role: "user", content: "医生怎么说？" }], context: { patientId: "P-A", page: "assistant" } });
    for (const q of ["医生怎么说？", "我的报告处理结果如何", "有反馈了吗"]) expect(pickTemplate("patient", "assistant", q)).toBe("patient_feedback");
    expect((await ask()).text).toMatch(/还没有医生对您报告的处理反馈/);
    const id = submitPro({ patientId: "P-A", scaleId: "endocrine_monthly_v1", items: { 关节痛: 3 }, flags: {} }).alerts[0].id;
    actOnAlert(id, "accept", "x"); actOnAlert(id, "start", "x"); actOnAlert(id, "submit_review", "x", "已沟通，建议复评");
    closeAlertWithTask(id, "张医生", "2 周后复评", { type: "复评", due: "2026-10-27", owner: "个案管理师小陈" });
    const plan = runTool("get_followup_plan", {}, { patientId: "P-A", page: "assistant" }) as { title: string; due: string }[];
    expect(plan).toContainEqual({ title: "复评（医生安排）", due: "2026-10-27", kind: "visit" });
    const r = await ask();
    expect(r.text).toContain("医生已处理您的报告：2 周后复评。新增随访：复评（2026-10-27）。");
    expect(r.text).toContain("已加入您的随访计划：2026-10-27 复评（医生安排）");
    expect(r.toolCalls.map(c => c.name)).toEqual(["get_latest_feedback", "get_followup_plan"]);
    expect(JSON.stringify(r.toolCalls)).not.toMatch(/msg-|task-|alert-/);
    expect(validateResponse(r, guidelineIds(), collectToolNumbers(r.toolCalls))).toEqual({ ok: true });
  });
});

describe("agents: F9 medication boundary and emergency escalation", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  afterEach(() => { vi.unstubAllGlobals(); clearEnv(); });
  const pat = (content: string, patientId = "P-A") => chat({ agent: "patient", messages: [{ role: "user", content }], context: { patientId, page: "assistant" } });
  it("new phrasings and medication-noun + verb questions route to the stop-med safety template", () => {
    for (const q of ["最近恶心乏力明显，能不能少打一次？", "药能少吃几天吗", "这周能跳过一次吗", "化疗能推迟一周吗", "我想暂停一下", "下次不打了行吗", "漏服一次要紧吗", "我能自己停吗", "打针能停一次吗", "输液可以换个时间少一点吗", "化疗想减一减"])
      expect(pickTemplate("patient", "assistant", q), q).toBe("patient_stop_med");
    for (const q of ["下次要做什么检查？", "参加临床研究需要注意什么？", "这个药有什么副作用"]) expect(pickTemplate("patient", "assistant", q), q).not.toBe("patient_stop_med");
  });
  it("severe symptoms route to patient_emergency with the duty phone, even when they also mention medication", async () => {
    for (const q of ["今天发热 38.5 度", "昨晚高烧", "牙龈出血不止", "有点呼吸困难", "胸痛", "家人说她意识不太清楚", "化疗后发热，能推迟下次吗"]) expect(pickTemplate("patient", "assistant", q), q).toBe("patient_emergency");
    const r = await pat("今天发热，浑身没劲");
    expect(r.text).toMatch(/急诊/); expect(r.text).toContain("值班电话 021-0000-0000（演示）"); expect(r.toolCalls).toEqual([]);
    expect(validateResponse(r, guidelineIds(), collectToolNumbers(r.toolCalls))).toEqual({ ok: true });
  });
  it("with a key configured, stop-med and emergency questions never reach the model (every mode)", async () => {
    for (const env of [() => { process.env.DEMO_CLAUDE_API_KEY = "ck"; }, () => { process.env.DEMO_OPENAI_API_KEY = "k"; process.env.DEMO_OPENAI_MODEL = "m"; }]) {
      clearEnv(); env(); const f = vi.fn(); vi.stubGlobal("fetch", f);
      for (const q of ["最近恶心乏力明显，能不能少打一次？", "化疗能推迟一周吗", "有点呼吸困难"]) {
        const r = await pat(q, "P-B"); expect(r.guarded, q).toBe(true); expect(r.degraded).toBeUndefined();
      }
      expect(f).not.toHaveBeenCalled();
    }
  });
  it("output guard: permits / suggests stopping degrade; 不可以停药 does not", async () => {
    const { PERMITS_STOP_MED } = await import("@/lib/agents/adapter");
    for (const t of ["可以先停药观察", "不妨少打一次", "建议暂停一周", "不如直接跳过", "可以推迟", "建议先减量"]) expect(PERMITS_STOP_MED.test(t), t).toBe(true);
    for (const t of ["不可以停药", "请不要自行停药或减量", "是否暂停需由医生确认"]) expect(PERMITS_STOP_MED.test(t), t).toBe(false);
    process.env.DEMO_OPENAI_API_KEY = "k"; process.env.DEMO_OPENAI_BASE_URL = "http://llm.test/v1"; process.env.DEMO_OPENAI_MODEL = "m";
    vi.stubGlobal("fetch", vi.fn(async () => json({ choices: [{ message: { role: "assistant", content: "不可以停药，请按时复查，有问题联系医生。" } }] })));
    const ok = await pat("下次要做什么检查？"); expect(ok.mode).toBe("openai"); expect(ok.degraded).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => json({ choices: [{ message: { role: "assistant", content: "建议暂停一次，下周再说。" } }] })));
    const bad = await pat("下次要做什么检查？"); expect(bad.mode).toBe("deterministic"); expect(bad.degraded).toBe("已切换至本地演示模式（输出未通过校验）");
  });
  it("OUTCOME matches OS / PFS as words only (POSITIVE, DOSE are not outcome questions)", () => {
    expect(pickTemplate("research", "feasibility", "OS 超过 2 年的有多少例？")).toBe("research_boundary");
    expect(pickTemplate("research", "feasibility", "中位PFS是多少")).toBe("research_boundary");
    expect(pickTemplate("research", "feasibility", "HER2 POSITIVE 符合的有多少例？")).toBe("research_count");
    expect(pickTemplate("research", "feasibility", "dose 调整后符合多少例")).toBe("research_count");
  });
});

describe("POST /api/agent", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  it("returns ChatResponse and writes agentMode to the store; 400 on bad body", async () => {
    const { POST } = await import("@/app/api/agent/route");
    getStore().agentMode = "claude";
    const ok = await POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ agent: "patient", messages: [{ role: "user", content: "参加临床研究需要注意什么？" }], context: { patientId: "P-A", page: "assistant" } }) }));
    expect(ok.status).toBe(200); const j = await ok.json(); expect(j.mode).toBe("deterministic"); expect(j.text.length).toBeGreaterThan(0);
    expect(getStore().agentMode).toBe("deterministic");
    const bad = await POST(new Request("http://x/api/agent", { method: "POST", body: JSON.stringify({ agent: "nope", messages: [], context: {} }) }));
    expect(bad.status).toBe(400);
  });
});
