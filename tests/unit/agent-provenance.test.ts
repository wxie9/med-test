import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat } from "@/lib/agents/adapter";
import { validateResponse } from "@/lib/agents/validate";
import { collectToolNumbers, guidelineIds, runTool } from "@/lib/agents/tools";
import { GENERIC_BOUNDARY, RESEARCH_BOUNDARY, pickTemplate } from "@/lib/agents/templates";
import { createCohort, createSnapshot, submitCohort } from "@/lib/governance/snapshot";
import { getStore, resetStore } from "@/lib/state/store";
import type { ChatRequest, ToolCallRecord } from "@/lib/agents/types";

const clearEnv = () => { for (const key of ["DEMO_CLAUDE_API_KEY", "DEMO_OPENAI_API_KEY", "DEMO_OPENAI_BASE_URL", "DEMO_OPENAI_MODEL"]) delete process.env[key]; };
const openaiEnv = () => { process.env.DEMO_OPENAI_API_KEY = "key"; process.env.DEMO_OPENAI_MODEL = "model"; process.env.DEMO_OPENAI_BASE_URL = "http://llm.test/v1"; };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const req = (agent: ChatRequest["agent"], text: string, snapshotId?: string): ChatRequest => ({ agent, messages: [{ role: "user", content: text }], context: agent === "research" ? { page: "feasibility", snapshotId } : { page: agent === "patient" ? "assistant" : "patient", patientId: "P-A" } });
const snapshot = () => { const c = createCohort("provenance", { everMetastatic: true }, "demo"); submitCohort(c.id); return createSnapshot(c.id, "2026-10-13"); };
const completion = (text: string) => vi.stubGlobal("fetch", vi.fn(async () => json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }] })));
const toolThenText = (name: string, args: unknown, text: string) => vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
  const body = JSON.parse(init.body);
  return json(body.messages.some((m: { role: string }) => m.role === "tool")
    ? { choices: [{ finish_reason: "stop", message: { role: "assistant", content: text } }] }
    : { choices: [{ finish_reason: "tool_calls", message: { role: "assistant", content: null, tool_calls: [{ id: "call", function: { name, arguments: JSON.stringify(args) } }] } }] });
}));
const assertFallback = (r: Awaited<ReturnType<typeof chat>>) => { expect(r.mode).toBe("deterministic"); expect(r.degraded).toContain("输出未通过校验"); };

describe("agent provenance regressions", () => {
  beforeEach(() => { resetStore(); clearEnv(); });
  afterEach(() => { vi.unstubAllGlobals(); clearEnv(); });

  it.each(["患者 99 岁。", "最近恶心 4 级。", "下次复诊是 2027-01-01。", "年龄九十九岁。"])("rejects unsupported clinical numbers without tools: %s", async text => {
    openaiEnv(); completion(text);
    const r = await chat(req("doctor", "总结这位患者的治疗经过"));
    assertFallback(r); expect(r.text).toContain("52 岁"); expect(r.text).not.toContain(text);
  });
  it("patient age cannot authorize a research count or a percentage", async () => {
    openaiEnv();
    for (const text of ["共有 52 例。", "比例为 52%。"]) {
      toolThenText("get_patient_summary", {}, text);
      assertFallback(await chat(req("doctor", "总结这位患者的治疗经过")));
    }
  });
  it("keeps an online answer with a correctly grounded patient age", async () => {
    openaiEnv(); toolThenText("get_patient_summary", {}, "患者 52 岁。请结合治疗记录确认后续安排。");
    const r = await chat(req("doctor", "总结这位患者的治疗经过"));
    expect(r.mode).toBe("openai"); expect(r.degraded).toBeUndefined();
  });
  it("a true value cannot authorize an invented numeric assertion around it", async () => {
    openaiEnv(); toolThenText("get_patient_summary", {}, "并非患者 52 岁。");
    assertFallback(await chat(req("doctor", "总结这位患者的治疗经过")));
  });
  it("does not transfer a PRO grade between symptoms", async () => {
    openaiEnv();
    const p = getStore().patients.get("P-A")!;
    p.pro = [{ id: "test-pro", scaleId: "endocrine_monthly_v1", submittedAt: "2026-10-13T04:00:00.000Z", items: { 关节痛: 2, 潮热: 0, 情绪: 0, 睡眠: 0 }, flags: {} }];
    toolThenText("get_latest_pro", {}, "最近问卷报告潮热 2 级。");
    assertFallback(await chat(req("doctor", "根据最近一次问卷起草症状处理建议")));
  });
  it.each(["可以自行停用来曲唑。", "建议您暂时停止服用来曲唑。", "先少吃一点药观察。", "这几天可以不吃药。", "并不是不可以自行停药。", "不能停药，但可以减量。", "可以隔天服用来曲唑。", "来曲唑可以停一天。", "来曲唑可以停一会儿。", "用药量减半就可以。", "您可以暂时不服用来曲唑。", "建议中断治疗。", "不建议不停药。", "可以自行调整药量。", "建议不要继续服用来曲唑。", "别再吃药了。", "不建议继续服用来曲唑。", "不需要继续服用来曲唑。", "今晚先别吃来曲唑，明天再恢复服用。", "先别服用来曲唑。"])("ordinary patient questions cannot permit medication adjustment: %s", async text => {
    openaiEnv(); completion(text);
    assertFallback(await chat(req("patient", "下次要做什么检查？")));
  });
  it.each(["不可以自行停用来曲唑，请联系医生。", "请不要自行停药或减量。", "是否暂停需由医生确认。", "您不能自行停用来曲唑。", "不要自行停药。", "不建议自行停止服药。"])("retains a clear medication boundary: %s", async text => {
    openaiEnv(); completion(text);
    expect((await chat(req("patient", "下次要做什么检查？"))).mode).toBe("openai");
  });
  it.each(["可以不再服用来曲唑。", "不建议再用来曲唑。", "不要继续药物治疗。"])("negative continuation wording cannot bypass the patient boundary: %s", async text => {
    openaiEnv(); completion(text); assertFallback(await chat(req("patient", "下次要做什么检查？")));
  });
  it.each(["今晚的药可以不服。", "来曲唑今晚先不服了。", "今晚的来曲唑不用了。", "不建议再服来曲唑。"])("short medication verbs cannot bypass the patient boundary: %s", async text => {
    openaiEnv(); completion(text); assertFallback(await chat(req("patient", "下次要做什么检查？")));
  });
  it.each(["不要吃辛辣食物。", "不建议再吃油腻食物。", "先别吃过烫的食物。"])("diet prohibitions stay online: %s", async text => {
    openaiEnv(); completion(text); const r = await chat(req("patient", "下次要做什么检查？")); expect(r.mode).toBe("openai"); expect(r.degraded).toBeUndefined();
  });
  it.each(["openai", "claude"])("research outcome questions are guarded before %s executes", async mode => {
    const s = snapshot(); if (mode === "openai") openaiEnv(); else process.env.DEMO_CLAUDE_API_KEY = "key";
    const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await chat(req("research", "符合条件患者的 PFS 是否更长？", s.id));
    expect(f).not.toHaveBeenCalled(); expect(r.guarded).toBe(true); expect(r.text).toBe(RESEARCH_BOUNDARY); expect(r.toolCalls).toEqual([]);
  });
  it.each(["PFS 明显延长，说明治疗有效。", "这些患者的生存获益更好。", "该方案能明显缩小肿瘤。"])("free-form research questions cannot return efficacy conclusions: %s", async text => {
    const s = snapshot(); openaiEnv(); completion(text);
    assertFallback(await chat(req("research", "解读当前快照", s.id)));
  });
  it("rejects a catalog citation not returned by this turn's search", async () => {
    openaiEnv(); completion("请参考 G-009 定期检查。");
    assertFallback(await chat(req("patient", "下次要做什么检查？")));
  });
  it("a search does not authorize another catalog citation", async () => {
    openaiEnv(); toolThenText("search_guidelines", { query: "骨健康" }, "请参考 G-002 定期检查。");
    assertFallback(await chat(req("patient", "下次要做什么检查？")));
  });
  it.each(["length", "content_filter"])("rejects OpenAI finish_reason=%s before executing tools", async finish_reason => {
    openaiEnv(); const f = vi.fn(async () => json({ choices: [{ finish_reason, message: { role: "assistant", content: "请按计划检查。", tool_calls: [{ id: "call", function: { name: "get_followup_plan", arguments: "{}" } }] } }] }));
    vi.stubGlobal("fetch", f);
    const r = await chat(req("patient", "下次要做什么检查？"));
    assertFallback(r); expect(r.detail).toBe(finish_reason); expect(f).toHaveBeenCalledTimes(1);
  });
  it("rejects an OpenAI refusal", async () => {
    openaiEnv(); vi.stubGlobal("fetch", vi.fn(async () => json({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: "请按计划检查。", refusal: "cannot answer" } }] })));
    const r = await chat(req("patient", "下次要做什么检查？")); assertFallback(r); expect(r.detail).toBe("refusal");
  });
  it("second-to-third line queries compute and render line 2", async () => {
    const s = snapshot(); const r = await chat(req("research", "二线后进入三线的比例？", s.id));
    const expected = runTool("line_transition", { lineNo: 2 }, { snapshotId: s.id, page: "feasibility" }) as { n: number; next_line: number };
    expect(r.toolCalls[0]).toMatchObject({ name: "line_transition", args: { lineNo: 2 }, result: expected });
    expect(r.text).toContain(`二线治疗记录的共 ${expected.n} 例`); expect(r.text).toContain(`进入三线 ${expected.next_line} 例`); expect(r.text).not.toContain("进入二线");
  });
  it("a configured provider cannot substitute line 1 for a second-to-third request", async () => {
    const s = snapshot(); openaiEnv();
    const first = runTool("line_transition", { lineNo: 1 }, { snapshotId: s.id, page: "feasibility" }) as { n: number };
    toolThenText("line_transition", { lineNo: 1 }, `有一线治疗记录的共 ${first.n} 例。`);
    const r = await chat(req("research", "二线后进入三线的比例？", s.id));
    expect(r.toolCalls[0]).toMatchObject({ name: "line_transition", args: { lineNo: 2 } }); expect(r.text).toContain("进入三线");
  });
  it.each(["进入下一线的有多少？", "一线还是二线后进入三线的比例？", "三线到四线的比例？", "二线进入四线的比例？"])("ambiguous or unsupported line questions fail closed: %s", async question => {
    const s = snapshot(); const r = await chat(req("research", question, s.id));
    expect(pickTemplate("research", "feasibility", question)).toBe("generic_boundary"); expect(r.toolCalls).toEqual([]); expect(r.text).toBe(GENERIC_BOUNDARY);
  });
  it("filtered count takes precedence over an incidental snapshot phrase", async () => {
    const s = snapshot(); const r = await chat(req("research", "当前快照中符合已知条件的共有多少例？", s.id));
    expect(r.toolCalls[0].name).toBe("funnel"); expect(r.text).toContain("符合已知条件");
  });
  it.each(["openai", "claude"])("known-condition requests cannot use a provider's total-only answer in %s", async mode => {
    const s = snapshot(); if (mode === "openai") openaiEnv(); else process.env.DEMO_CLAUDE_API_KEY = "key";
    const total = runTool("count_cohort", { filter: {} }, { snapshotId: s.id, page: "feasibility" }) as { n: number };
    const intended = runTool("funnel", {}, { snapshotId: s.id, page: "feasibility" }) as { finalMetCount: number };
    if (mode === "openai") toolThenText("count_cohort", { filter: {} }, `快照共 ${total.n} 例。`);
    else vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      return json(body.messages.length === 1 ? { stop_reason: "tool_use", content: [{ type: "tool_use", id: "call", name: "count_cohort", input: { filter: {} } }] } : { stop_reason: "end_turn", content: [{ type: "text", text: `快照共 ${total.n} 例。` }] });
    }));
    const r = await chat(req("research", "当前快照中符合已知条件的共有多少例？", s.id));
    expect(r.toolCalls[0]).toMatchObject({ name: "funnel", result: { finalMetCount: intended.finalMetCount } });
    expect(r.text).toContain(`符合已知条件 ${intended.finalMetCount} 例`); expect(r.guarded).toBe(true); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["该方案的有效率为百分之九十。", "患者体温三十八点五度。", "建议每天服用五毫克。", "血压为一百二十毫米汞柱。", "单次剂量为半片。"])("Chinese clinical numeric forms require controlled evidence: %s", async text => {
    expect(validateResponse({ text, citations: [], toolCalls: [] }, guidelineIds()).ok).toBe(false);
    openaiEnv(); completion(text); assertFallback(await chat(req("doctor", "总结这位患者的治疗经过")));
  });
  it.each(["一线和二线后进入下一线的比例分别是多少？", "不是一线，是二线后进入下一线的比例？", "一线后和二线后的情况分别如何？"])("multi-source or corrected transition questions do not silently select line 1: %s", async question => {
    const s = snapshot(); openaiEnv(); const f = vi.fn(); vi.stubGlobal("fetch", f);
    const r = await chat(req("research", question, s.id));
    expect(r.text).toBe(GENERIC_BOUNDARY); expect(r.toolCalls).toEqual([]); expect(f).not.toHaveBeenCalled();
  });
  it("PRO and feedback UTC timestamps project to the Shanghai calendar date", () => {
    const p = getStore().patients.get("P-A")!;
    for (const [at, date] of [["2026-10-13T17:00:00.000Z", "2026-10-14"], ["2026-10-14T01:00:00.000Z", "2026-10-14"]]) {
      p.pro = [{ id: "morning-pro", scaleId: "endocrine_monthly_v1", submittedAt: at, items: { 关节痛: 2, 潮热: 0, 情绪: 0, 睡眠: 0 }, flags: {} }];
      getStore().messages = [{ id: "morning-feedback", patientId: p.id, kind: "alert_feedback", at, text: "请按计划复评" }];
      expect(runTool("get_latest_pro", {}, { patientId: p.id, page: "patient" })).toMatchObject({ date });
      expect(runTool("get_latest_feedback", {}, { patientId: p.id, page: "assistant" })).toMatchObject({ date });
    }
  });
  it("latest PRO selects the later instant across UTC and Shanghai timestamp offsets", () => {
    const p = getStore().patients.get("P-A")!;
    const older = { id: "older-pro", scaleId: "endocrine_monthly_v1" as const, submittedAt: "2026-10-13T23:00:00+08:00", items: { 关节痛: 1, 潮热: 0, 情绪: 0, 睡眠: 0 }, flags: {} };
    const newer = { ...older, id: "newer-pro", submittedAt: "2026-10-13T17:00:00.000Z", items: { 关节痛: 3, 潮热: 0, 情绪: 0, 睡眠: 0 } };
    for (const records of [[older, newer], [newer, older]]) {
      p.pro = records;
      const result = runTool("get_latest_pro", {}, { patientId: p.id, page: "patient" }) as { date: string; symptoms: { symptom: string; grade: number }[] };
      expect(result.date).toBe("2026-10-14"); expect(result.symptoms[0]).toEqual({ symptom: "关节痛", grade: 3 });
    }
  });
  it("latest feedback compares instants and keeps the later-written message on equal instants", () => {
    const patientId = "P-A";
    const older = { id: "older-feedback", patientId, kind: "alert_feedback" as const, at: "2026-10-13T23:00:00+08:00", text: "旧反馈" };
    const newer = { ...older, id: "newer-feedback", at: "2026-10-13T17:00:00.000Z", text: "新反馈" };
    for (const records of [[older, newer], [newer, older]]) {
      getStore().messages = records;
      expect(runTool("get_latest_feedback", {}, { patientId, page: "assistant" })).toMatchObject({ date: "2026-10-14", text: "新反馈" });
    }
    getStore().messages = [newer, { ...newer, id: "same-instant-later-written", at: "2026-10-14T01:00:00+08:00", text: "同一时刻后写入的反馈" }];
    expect(runTool("get_latest_feedback", {}, { patientId, page: "assistant" })).toMatchObject({ text: "同一时刻后写入的反馈" });
  });
  it("flattened numbers are never authoritative without recognized tool fields", () => {
    const calls: ToolCallRecord[] = [{ name: "get_patient_summary", args: {}, result: { age: 52 } }];
    expect(validateResponse({ text: "共 52 例", citations: [], toolCalls: calls }, guidelineIds(), collectToolNumbers(calls)).ok).toBe(false);
  });
  it("missing ER/PR never becomes negative in the patient summary", () => {
    const p = getStore().patients.get("P-A")!;
    for (const missing of ["erPct", "prPct"] as const) {
      for (const b of p.biomarkers) { b.erPct = 0; b.prPct = 0; b[missing] = null; }
      expect(runTool("get_patient_summary", {}, { patientId: p.id, page: "patient" })).toMatchObject({ hr: "未知" });
    }
  });
  it("a configured snapshot-size question uses the correct guarded total computation", async () => {
    const s = snapshot(); openaiEnv();
    const toolResult = runTool("count_cohort", { filter: {} }, { snapshotId: s.id, page: "feasibility" }) as { n: number };
    toolThenText("count_cohort", { filter: {} }, `快照共 ${toolResult.n} 例。`);
    const r = await chat(req("research", "当前快照共有多少例？", s.id)); expect(r.mode).toBe("openai"); expect(r.degraded).toBeUndefined();
    expect(r.guarded).toBe(true); expect(fetch).not.toHaveBeenCalled(); expect(r.toolCalls[0]).toMatchObject({ name: "count_cohort", args: { filter: {} }, result: { n: toolResult.n } });
  });
  it("an unlisted efficacy paraphrase also fails the controlled research grammar", async () => {
    const s = snapshot(); openaiEnv();
    const toolResult = runTool("count_cohort", { filter: {} }, { snapshotId: s.id, page: "feasibility" }) as { n: number };
    toolThenText("count_cohort", { filter: {} }, `快照共 ${toolResult.n} 例。这种药让大家活得更久。`);
    assertFallback(await chat(req("research", "解读当前快照", s.id)));
  });

  describe("everyday numeral wording (validator is unit-aware)", () => {
    const noTools = (text: string) => validateResponse({ text, citations: [], toolCalls: [] }, guidelineIds());
    it.each(["请一定按时服药，一般来说不适会逐渐缓解。", "万一出现发热，请立即到急诊就诊。", "一旦有不适，请统一通过“消息”联系个案管理师，大家一起商量。", "这与一些患者的情况一样，两者都需要医生确认。", "请进一步观察，一定不要自行调整。"])("patient sentences without quantities stay online: %s", async text => {
      expect(noTools(text).ok).toBe(true);
      openaiEnv(); completion(text);
      const r = await chat(req("patient", "下次要做什么检查？")); expect(r.mode).toBe("openai"); expect(r.degraded).toBeUndefined();
    });
    it.each(["建议进一步完善影像学评估后再决定。", "两者需结合病历统一判断，万一有疑问请复核。"])("doctor sentences without quantities stay online: %s", async text => {
      expect(noTools(text).ok).toBe(true);
      openaiEnv(); completion(text);
      const r = await chat(req("doctor", "总结这位患者的治疗经过")); expect(r.mode).toBe("openai"); expect(r.degraded).toBeUndefined();
    });
    it.each(["请一天服用一次。", "半年后复查。", "两周后复诊。", "随访三个月。", "共一百二十例。", "有效率为百分之九十。", "剂量为五毫克。", "一线治疗后再评估。", "万一天气变化请注意，一周后复诊。"])("Chinese numerals followed by a unit still need a tool-field fact: %s", text => {
      expect(noTools(text).ok).toBe(false); expect(noTools(text).reason).toMatch(/^number /);
    });
    it("Arabic numbers stay strictly fact-bound", () => {
      expect(noTools("一般 3 天后复查。").ok).toBe(false);
      expect(validateResponse({ text: "患者 53 岁。", citations: [], toolCalls: [{ name: "get_patient_summary", args: {}, result: { age: 52 } }] }, guidelineIds()).ok).toBe(false);
    });
  });
  describe("research reply rule", () => {
    it("number-free descriptive prose without conclusion wording passes", async () => {
      const s = snapshot(); openaiEnv(); completion("本演示仅提供描述性统计与入组可行性评估，请结合上方的筛选漏斗阅读计数结果。");
      const r = await chat(req("research", "解读当前快照", s.id)); expect(r.mode).toBe("openai"); expect(r.degraded).toBeUndefined();
    });
    it.each(["入组后预后更好。", "两者差异不大。", "这些患者更适合该方案。", "建议优先纳入这部分患者。"])("conclusion wording outside a server fact still fails: %s", async text => {
      const s = snapshot(); openaiEnv(); completion(text); assertFallback(await chat(req("research", "解读当前快照", s.id)));
    });
    it("fabricated counts still fail", async () => {
      const s = snapshot(); openaiEnv();
      const total = runTool("count_cohort", { filter: {} }, { snapshotId: s.id, page: "feasibility" }) as { n: number };
      toolThenText("count_cohort", { filter: {} }, `快照共 ${total.n + 1} 例。`);
      assertFallback(await chat(req("research", "解读当前快照", s.id)));
      completion("共有 10 例符合条件。"); assertFallback(await chat(req("research", "解读当前快照", s.id)));
    });
    it("unknown citations and patient ids still fail", async () => {
      const s = snapshot();
      expect(validateResponse({ text: "参考 G-999。", citations: [], toolCalls: [] }, guidelineIds())).toEqual({ ok: false, reason: "unknown citation G-999" });
      expect(validateResponse({ text: "P-A 符合条件。", citations: [], toolCalls: [] }, guidelineIds())).toEqual({ ok: false, reason: "patient id in reply" });
      openaiEnv(); completion("P-A 符合条件。"); assertFallback(await chat(req("research", "解读当前快照", s.id)));
      completion("参考 G-999。"); assertFallback(await chat(req("research", "解读当前快照", s.id)));
    });
  });
});
