import * as claude from "./providers/claude";
import * as openai from "./providers/openai";
import * as deterministic from "./providers/deterministic";
import { validateResponse } from "./validate";
import { guidelineIds } from "./tools";
import { pickTemplate, SAFETY_TEMPLATES, isLineQuestion } from "./templates";
import { isControlledResearchReply, permitsMedicationAdjustment } from "./boundaries";
import { OutputRejected } from "./providers/shared";
import type { ChatRequest, ChatResponse, SharedToolState } from "./types";
export type { ChatRequest, ChatResponse } from "./types";
/** A patient-facing model reply must never permit or suggest stopping / reducing / skipping / delaying medication ("不可以停药" is fine). */
export const PERMITS_STOP_MED = { test: permitsMedicationAdjustment };
const rawReason = (e: unknown) => e instanceof OutputRejected ? e.message : (e instanceof Error || e instanceof DOMException) ? `${e.name === "Error" ? "" : `${e.name}: `}${e.message}` : String(e);
/** User-facing degrade category; the raw reason goes to `detail`. */
function category(e: unknown): string {
  if (e instanceof OutputRejected) return "输出未通过校验";
  const name = e instanceof Error || e instanceof DOMException ? e.name : "";
  const msg = e instanceof Error || e instanceof DOMException ? e.message : String(e);
  if (name === "TimeoutError" || name === "AbortError") return "超时";
  if (/^HTTP (401|403)\b/.test(msg)) return "鉴权失败（401/403）";
  if (/^HTTP 429\b/.test(msg)) return "请求过于频繁（429）";
  if (/^missing DEMO_/.test(msg)) return "配置缺失";
  if (name === "SyntaxError" || /^(validation:|empty reply|invalid response|too many tool rounds)/.test(msg)) return "输出未通过校验";
  return "网络错误";
}
/**
 * Mode by env. Patient safety questions and supported quantitative research routes
 * use server templates, binding each answer to the requested computation and field.
 * Otherwise a model reply must pass validation; any failure (network / HTTP / timeout / invalid output / config) falls back to templates.
 */
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const mode = process.env.DEMO_CLAUDE_API_KEY ? "claude" : process.env.DEMO_OPENAI_API_KEY ? "openai" : "deterministic";
  const shared: SharedToolState = {};
  if (mode === "deterministic") return { ...(await deterministic.run(req, shared)), mode };
  const question = deterministic.lastUserText(req), template = pickTemplate(req.agent, req.context.page, question);
  if ((req.agent === "patient" && SAFETY_TEMPLATES.has(template)) || (req.agent === "research" && (template === "research_boundary" || template === "research_line_transition" || template === "research_count" || template === "research_snapshot_size" || (template === "generic_boundary" && isLineQuestion(question)))))
    return { ...(await deterministic.run(req, shared)), mode, guarded: true };
  try {
    const out = await (mode === "claude" ? claude.run(req, shared) : openai.run(req, shared));
    const v = validateResponse(out, guidelineIds());
    if (!v.ok) throw new Error(`validation: ${v.reason}`);
    if (req.agent === "patient" && PERMITS_STOP_MED.test(out.text)) throw new Error("validation: reply permits stopping medication");
    if (req.agent === "research" && !isControlledResearchReply(out.text, out.toolCalls)) throw new Error("validation: research reply is not a controlled descriptive fact");
    return { ...out, mode };
  } catch (e) {
    const fallback = await deterministic.run(req, shared);
    return { ...fallback, mode: "deterministic", degraded: `已切换至本地演示模式（${category(e)}）`, detail: rawReason(e) };
  }
}
