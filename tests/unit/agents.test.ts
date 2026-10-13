import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { chat } from "@/lib/agents/adapter";
import { validateResponse } from "@/lib/agents/validate";
import { collectToolNumbers, guidelineIds, runTool } from "@/lib/agents/tools";
import { pickTemplate } from "@/lib/agents/templates";
import { QUICK_QUESTIONS } from "@/lib/agents/quickQuestions";
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
  it("all nine quick questions reply, cite only known guidelines, use only tool numbers, and leak no patient ids", async () => {
    const snap = metSnapshot();
    const ctx: Record<ChatRequest["agent"], ChatRequest["context"]> = { patient: { patientId: "P-A", page: "assistant" }, doctor: { patientId: "P-B", page: "patient" }, research: { snapshotId: snap.id, page: "feasibility" } };
    for (const agent of ["patient", "doctor", "research"] as const) {
      for (const q of QUICK_QUESTIONS[agent]) {
        const r = await chat({ agent, messages: [{ role: "user", content: q }], context: ctx[agent] });
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
