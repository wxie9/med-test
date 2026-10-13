import { citationsFromText, clientSafe, clientToolCalls, type ToolSession } from "../tools";
import type { ChatRequest, ProviderOutput } from "../types";
export const TIMEOUT_MS = 8000;
export const MAX_TOOL_ROUNDS = 3;
export const MAX_TOKENS = 800;
const ROLE: Record<ChatRequest["agent"], string> = {
  patient: "你是乳腺癌患者的随访管家，面向患者本人，语气温和易懂。不做诊断；绝不建议停药、减量或换药，涉及用药调整一律请患者由医生确认或到门诊就诊。",
  doctor: "你是乳腺专科医生的临床助手。回答基于当前患者的结构化数据与指南要点库；指南要点尚待专家审阅，仅供参考。",
  research: "你是药企研究人员的入组可行性评估助手，只能使用去标识化研究快照的计数结果，不得透露任何个体信息。仅当用户询问补齐数据时，才调用一次 create_gap_task。",
};
export function systemPrompt(req: ChatRequest): string {
  return [
    ROLE[req.agent],
    "规则：",
    "1. 只用中文回答，简洁，不超过 200 字。",
    "2. 回答中的任何数字（尤其是“例”“人”“%”）只能来自工具返回结果，不得估算或编造；比例写成百分数并保留一位小数。",
    "3. 引用指南要点时写出编号（如 G-004），编号只能来自 search_guidelines 的返回；检索为空时回答“未找到依据”。",
    "4. 不得输出任何患者编号（如 P-0001）或可识别个人的信息。",
    `当前页面：${req.context.page}。`,
  ].join("\n");
}
/** Runs a model-requested tool; errors go back to the model as text instead of aborting the turn. Results are sanitised before the model sees them. */
export function execForModel(session: ToolSession, name: string, input: unknown): { content: string; isError: boolean } {
  try { return { content: JSON.stringify(clientSafe(session.call(name, input))), isError: false }; }
  catch (e) { return { content: `error: ${e instanceof Error ? e.message : String(e)}`, isError: true }; }
}
export function finish(text: string, session: ToolSession): ProviderOutput {
  const t = text.trim(); if (!t) throw new Error("empty reply");
  return { text: t, citations: citationsFromText(t), toolCalls: clientToolCalls(session.calls) };
}
