import { STATIC_SAFETY_FACT, TECHNICAL_IDENTIFIERS, toolFacts } from "./evidence";
import type { ToolCallRecord } from "./types";
/** Patient ids (P-A … P-2000) must never appear in an assistant reply. */
export const PATIENT_ID_RE = /\bP-[A-Z0-9]{1,4}\b/;
export function validateResponse(resp: { text: string; citations: { id: string; title?: string; version?: string }[]; toolCalls: { name?: string; args?: unknown; result: unknown }[] }, knownCitationIds: Set<string>, _legacyToolNumbers?: Set<number>): { ok: boolean; reason?: string } {
  void _legacyToolNumbers; // compatibility only; numeric pools never establish provenance
  if (PATIENT_ID_RE.test(resp.text)) return { ok: false, reason: "patient id in reply" };
  const returnedIds = new Set<string>();
  for (const c of resp.toolCalls) if (c.name === "search_guidelines" && Array.isArray(c.result)) {
    for (const g of c.result as { id: string }[]) returnedIds.add(g.id);
  }
  const citedIds = new Set([...resp.citations.map(c => c.id), ...[...resp.text.matchAll(/\bG-\d{3}\b/g)].map(m => m[0])]);
  for (const id of citedIds) {
    if (!knownCitationIds.has(id)) return { ok: false, reason: `unknown citation ${id}` };
    if (!returnedIds.has(id)) return { ok: false, reason: `citation ${id} not returned by this turn's search` };
  }
  const text = resp.text.normalize("NFKC").replace(/\s+/g, "");
  const covered = new Uint8Array(text.length);
  const cover = (fragment: string) => {
    const f = fragment.normalize("NFKC").replace(/\s+/g, ""); if (!f) return;
    for (let i = text.indexOf(f); i !== -1; i = text.indexOf(f, i + 1)) covered.fill(1, i, i + f.length);
  };
  const facts = toolFacts(resp.toolCalls as ToolCallRecord[]);
  for (const f of facts) cover(f.text);
  if (resp.text === STATIC_SAFETY_FACT) cover(STATIC_SAFETY_FACT);
  for (const m of text.matchAll(TECHNICAL_IDENTIFIERS)) covered.fill(1, m.index, m.index + m[0].length);
  for (const id of citedIds) cover(id);
  // Treat Chinese numerals as potential quantities regardless of the following unit.
  // This covers 百分之九十, 三十八点五度, 五毫克, 半片 and unrecognized
  // units conservatively. Incidental numeral wording can also require a source clause.
  // A caller's flattened number set is never used.
  const numbers = /\d+(?:\.\d+)?|[零〇一二三四五六七八九十百千万亿两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟萬億半]+(?:点[零〇一二三四五六七八九十百千万亿两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟萬億半]+)?/g;
  for (const m of text.matchAll(numbers)) {
    if (covered.subarray(m.index, m.index + m[0].length).some(x => !x)) return { ok: false, reason: `number ${m[0]} lacks a tool-field fact` };
  }
  // Matching a source substring inside a new assertion is insufficient (e.g. "并非
  // 患者52岁"). Each numeric clause must itself be a controlled source clause.
  const clauses = (s: string) => s.split(/[。\n；;，,]/).map(c => c.normalize("NFKC").replace(/\s+/g, "").replace(/^[·•]/, "")).filter(Boolean);
  const allowedClauses = new Set(facts.flatMap(f => clauses(f.text)));
  if (resp.text === STATIC_SAFETY_FACT) clauses(STATIC_SAFETY_FACT).forEach(c => allowedClauses.add(c));
  for (const clause of clauses(resp.text)) {
    const measurements = clause.replace(TECHNICAL_IDENTIFIERS, "").replace(/\bG-\d{3}\b/g, "");
    const n = [...measurements.matchAll(numbers)][0];
    if (n && !allowedClauses.has(clause)) return { ok: false, reason: `number ${n[0]} is outside a controlled tool-field clause` };
  }
  return { ok: true };
}
