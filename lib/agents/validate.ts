import { STATIC_SAFETY_FACT, TECHNICAL_IDENTIFIERS, toolFacts } from "./evidence";
import type { ToolCallRecord } from "./types";
/** Patient ids (P-A … P-2000) must never appear in an assistant reply. */
export const PATIENT_ID_RE = /\bP-[A-Z0-9]{1,4}\b/;

const CN_DIGIT = "[零〇一二三四五六七八九十百千万亿两兩壹贰貳叁參肆伍陆陸柒捌玖拾佰仟萬億]";
/**
 * Units and measure words that turn a Chinese numeral into a quantity. The list is
 * deliberately wider than the demo's own facts (doses, temperatures, blood pressure,
 * durations) so that unrecognized clinical measurements still fail closed.
 */
const UNIT = "(?:例|人次|人|次|天|日|周|月|年|%|个|mg|ml|毫克|毫升|级|项|种|岁|度|片|粒|毫米汞柱|mmHg|线|小时|分钟|周期|cm|mm|厘米|毫米|kg|千克|公斤|倍)";
/**
 * Everyday words that contain a numeral character but never state a quantity. They
 * are masked before scanning so that neither the numeral rule nor the unit rule can
 * fire inside them (e.g. 万一天气 would otherwise read 一天). 半年 is intentionally not
 * listed: 半 + 年 is a duration and is caught by the unit rule.
 */
export const EVERYDAY_NUMERAL_WORDS = ["一定", "一般", "进一步", "一旦", "万一", "统一", "一起", "一样", "一些", "两者", "一下", "一直", "一切", "一致", "唯一", "之一", "一同", "一并", "一律"] as const;
/**
 * Quantity rule (the only numeric forms that require a field-bound tool fact):
 *   1. any Arabic number (integers, decimals, dates) — always, regardless of context;
 *   2. 百分之 + Chinese numerals (a percentage);
 *   3. Chinese numerals (optionally with a 点 decimal part, optionally 半) immediately
 *      followed by a unit or measure word from UNIT (例/人/次/天/周/月/年/%/个/mg/ml/级/项/种/岁…).
 * Chinese numerals with no unit (一旦, 进一步, 一线 is a unit, 第一 without a measure word)
 * are ordinary wording and are not treated as quantities.
 */
const QUANTITY = new RegExp(`\\d+(?:\\.\\d+)?|百分之${CN_DIGIT}+(?:点${CN_DIGIT}+)?|(?:${CN_DIGIT}|半)+(?:点(?:${CN_DIGIT}|半)+)?(?=${UNIT})`, "gi");
const maskEveryday = (s: string) => EVERYDAY_NUMERAL_WORDS.reduce((acc, w) => acc.split(w).join("＊".repeat(w.length)), s);
/** Quantities in an NFKC-normalized, whitespace-free string, with their positions. */
export function quantities(normalized: string): { index: number; text: string }[] {
  return [...maskEveryday(normalized).matchAll(QUANTITY)].map(m => ({ index: m.index, text: m[0] }));
}

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
  // Every quantity (see QUANTITY) must sit inside a verbatim tool-field fact. A caller's
  // flattened number set is never used.
  for (const q of quantities(text)) {
    if (covered.subarray(q.index, q.index + q.text.length).some(x => !x)) return { ok: false, reason: `number ${q.text} lacks a tool-field fact` };
  }
  // Matching a source substring inside a new assertion is insufficient (e.g. "并非
  // 患者52岁"). Each clause containing a quantity must itself be a controlled source clause.
  const clauses = (s: string) => s.split(/[。\n；;，,]/).map(c => c.normalize("NFKC").replace(/\s+/g, "").replace(/^[·•]/, "")).filter(Boolean);
  const allowedClauses = new Set(facts.flatMap(f => clauses(f.text)));
  if (resp.text === STATIC_SAFETY_FACT) clauses(STATIC_SAFETY_FACT).forEach(c => allowedClauses.add(c));
  for (const clause of clauses(resp.text)) {
    const measurements = clause.replace(TECHNICAL_IDENTIFIERS, "").replace(/\bG-\d{3}\b/g, "");
    const q = quantities(measurements)[0];
    if (q && !allowedClauses.has(clause)) return { ok: false, reason: `number ${q.text} is outside a controlled tool-field clause` };
  }
  return { ok: true };
}
