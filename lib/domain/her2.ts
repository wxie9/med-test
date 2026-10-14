import type { Biomarker } from "./types";
export type Her2Class = "low" | "zero" | "positive" | "indeterminate";
export function deriveHer2Low(b: Biomarker): Her2Class {
  if (b.her2Ihc === "3+") return "positive";
  if (b.her2Ihc === "2+") return b.ish === "positive" ? "positive" : b.ish === "negative" ? "low" : "indeterminate";
  if (b.her2Ihc === "1+") return "low";
  if (b.her2Ihc === "0") return "zero";
  return "indeterminate";
}
/** 取最新标本（转移灶优先于同日原发）做当前分类 */
export function currentHer2(biomarkers: Biomarker[]): Her2Class {
  if (!biomarkers.length) return "indeterminate";
  const sorted = [...biomarkers].sort((a, b) => (a.specimenDate === b.specimenDate ? (a.specimenSite === "metastatic" ? -1 : 1) : a.specimenDate < b.specimenDate ? 1 : -1));
  return deriveHer2Low(sorted[0]);
}
export type HrClass = "positive" | "negative" | "indeterminate";
/** Either known positive receptor establishes HR+; HR− requires both known negative results. */
export function deriveHr(b: Biomarker): HrClass {
  if ((b.erPct !== null && b.erPct >= 1) || (b.prPct !== null && b.prPct >= 1)) return "positive";
  if (b.erPct !== null && b.prPct !== null) return "negative";
  return "indeterminate";
}
export const isHrPositive = (b: Biomarker) => deriveHr(b) === "positive";
