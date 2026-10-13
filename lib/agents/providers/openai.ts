import { createToolSession, toolsFor } from "../tools";
import type { ChatRequest, ProviderOutput, SharedToolState } from "../types";
import { systemPrompt, execForModel, finish, TIMEOUT_MS, MAX_TOOL_ROUNDS, MAX_TOKENS } from "./shared";
type ToolCall = { id: string; type?: string; function: { name: string; arguments?: string } };
type Message = { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string };
/** OpenAI-compatible chat/completions with function calling; at most MAX_TOOL_ROUNDS tool rounds, one 8 s deadline for the whole turn. */
export async function run(req: ChatRequest, shared: SharedToolState = {}): Promise<ProviderOutput> {
  const key = process.env.DEMO_OPENAI_API_KEY; if (!key) throw new Error("missing DEMO_OPENAI_API_KEY");
  const model = process.env.DEMO_OPENAI_MODEL; if (!model) throw new Error("missing DEMO_OPENAI_MODEL");
  const base = (process.env.DEMO_OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const session = createToolSession(req, shared);
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const tools = toolsFor(req.agent).map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const messages: Message[] = [{ role: "system", content: systemPrompt(req) }, ...req.messages.map(m => ({ role: m.role, content: m.content }))];
  for (let round = 0; ; round++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST", signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: MAX_TOKENS, tools, messages }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: Message }[] };
    const msg = data.choices?.[0]?.message; if (!msg) throw new Error("invalid response");
    const calls = msg.tool_calls ?? [];
    if (calls.length) {
      if (round >= MAX_TOOL_ROUNDS) throw new Error("too many tool rounds");
      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
      for (const c of calls) {
        let input: unknown;
        try { input = JSON.parse(c.function.arguments || "{}"); } catch { messages.push({ role: "tool", tool_call_id: c.id, content: "error: arguments are not valid JSON" }); continue; }
        messages.push({ role: "tool", tool_call_id: c.id, content: execForModel(session, c.function.name, input).content });
      }
      continue;
    }
    return finish(msg.content ?? "", session);
  }
}
