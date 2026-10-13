import { pickTemplate, renderTemplate, runTemplateTools, GENERIC_BOUNDARY } from "../templates";
import { createToolSession, clientToolCalls, citationsFromCalls } from "../tools";
import { PATIENT_ID_RE } from "../validate";
import type { ChatRequest, ProviderOutput, SharedToolState } from "../types";
export const lastUserText = (req: ChatRequest) => [...req.messages].reverse().find(m => m.role === "user")?.content ?? "";
/** Keyword-routed template → the template's tools → rendered text (numbers only from tool results). */
export async function run(req: ChatRequest, shared: SharedToolState = {}): Promise<ProviderOutput> {
  const userText = lastUserText(req);
  const id = pickTemplate(req.agent, req.context.page, userText);
  const session = createToolSession(req, shared);
  try { runTemplateTools(id, session.call, userText); }
  catch (e) {
    return { text: `暂时无法获取所需数据（${e instanceof Error ? e.message : String(e)}），请稍后重试或联系个案管理师。`, citations: [], toolCalls: clientToolCalls(session.calls) };
  }
  const text = renderTemplate(id, session.calls);
  if (PATIENT_ID_RE.test(text)) return { text: GENERIC_BOUNDARY, citations: [], toolCalls: [] }; // never ship a patient id
  return { text, citations: citationsFromCalls(session.calls), toolCalls: clientToolCalls(session.calls) };
}
