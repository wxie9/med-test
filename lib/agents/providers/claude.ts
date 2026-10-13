import { createToolSession, toolsFor } from "../tools";
import type { ChatRequest, ProviderOutput, SharedToolState } from "../types";
import { systemPrompt, execForModel, finish, TIMEOUT_MS, MAX_TOOL_ROUNDS, MAX_TOKENS } from "./shared";
const URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5-5";
type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown } | { type: string };
const isToolUse = (b: Block): b is Extract<Block, { type: "tool_use" }> => b.type === "tool_use";
const isText = (b: Block): b is Extract<Block, { type: "text" }> => b.type === "text";
/** Anthropic Messages API with tool use; at most MAX_TOOL_ROUNDS tool rounds, one 8 s deadline for the whole turn. */
export async function run(req: ChatRequest, shared: SharedToolState = {}): Promise<ProviderOutput> {
  const key = process.env.DEMO_CLAUDE_API_KEY; if (!key) throw new Error("missing DEMO_CLAUDE_API_KEY");
  const session = createToolSession(req, shared);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const tools = toolsFor(req.agent).map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  const messages: { role: "user" | "assistant"; content: unknown }[] = req.messages.map(m => ({ role: m.role, content: m.content }));
  for (let round = 0; ; round++) {
    const res = await fetch(URL, {
      method: "POST", signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: systemPrompt(req), tools, messages }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { stop_reason?: string; content?: Block[] };
    const content = Array.isArray(data.content) ? data.content : [];
    const uses = content.filter(isToolUse);
    if (data.stop_reason === "tool_use" && uses.length) {
      if (round >= MAX_TOOL_ROUNDS) throw new Error("too many tool rounds");
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: uses.map(u => { const r = execForModel(session, u.name, u.input); return { type: "tool_result", tool_use_id: u.id, content: r.content, ...(r.isError ? { is_error: true } : {}) }; }) });
      continue;
    }
    return finish(content.filter(isText).map(b => b.text).join(""), session);
  }
}
