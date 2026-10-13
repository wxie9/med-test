/** Patient ids (P-A … P-2000) must never appear in an assistant reply. */
export const PATIENT_ID_RE = /\bP-[A-Z0-9]{1,4}\b/;
export function validateResponse(resp: { text: string; citations: { id: string; title?: string; version?: string }[]; toolCalls: { result: unknown }[] }, knownCitationIds: Set<string>, toolNumbers: Set<number>): { ok: boolean; reason?: string } {
  for (const c of resp.citations) if (!knownCitationIds.has(c.id)) return { ok: false, reason: `unknown citation ${c.id}` };
  const nums = [...resp.text.matchAll(/(\d+(?:\.\d+)?)\s*(例|人|%)/g)].map(m => Number(m[1]));
  for (const n of nums) if (!toolNumbers.has(n)) return { ok: false, reason: `number ${n} not from tools` };
  if (PATIENT_ID_RE.test(resp.text)) return { ok: false, reason: "patient id in reply" };
  return { ok: true };
}
