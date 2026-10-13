import * as claude from "./providers/claude";
import * as openai from "./providers/openai";
import * as deterministic from "./providers/deterministic";
import { validateResponse } from "./validate";
import { guidelineIds, collectToolNumbers } from "./tools";
import type { ChatRequest, ChatResponse, SharedToolState } from "./types";
export type { ChatRequest, ChatResponse } from "./types";
const reason = (e: unknown) => (e instanceof Error || e instanceof DOMException) ? (e.name === "TimeoutError" || e.name === "AbortError" ? "超时" : e.message || "错误") : "错误";
/** Mode by env; a model provider's reply must pass validation, otherwise (no key / network / HTTP error / timeout / invalid output) fall back to templates. */
export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const mode = process.env.DEMO_CLAUDE_API_KEY ? "claude" : process.env.DEMO_OPENAI_API_KEY ? "openai" : "deterministic";
  const shared: SharedToolState = {};
  if (mode === "deterministic") return { ...(await deterministic.run(req, shared)), mode };
  try {
    const out = await (mode === "claude" ? claude.run(req, shared) : openai.run(req, shared));
    const v = validateResponse(out, guidelineIds(), collectToolNumbers(out.toolCalls));
    if (!v.ok) throw new Error(`validation: ${v.reason}`);
    return { ...out, mode };
  } catch (e) {
    const fallback = await deterministic.run(req, shared);
    return { ...fallback, mode: "deterministic", degraded: `已切换至本地演示模式（${reason(e)}）` };
  }
}
