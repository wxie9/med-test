import type { Patient } from "@/lib/domain/types";
import { currentHer2 } from "@/lib/domain/her2";
import { everMetastatic } from "./filter";
export function qualityMetrics(ps: Patient[]) {
  const n = ps.length || 1; const has = (f: (p: Patient) => boolean) => ps.filter(f).length / n;
  const metastatic = ps.filter(p => p.stage === "metastatic" || p.stage === "deceased" || everMetastatic(p)); const lines = metastatic.flatMap(p => p.lines);
  return {
    n: ps.length,
    completeness: { subtype: has(p => currentHer2(p.biomarkers) !== "indeterminate"), stage: has(p => p.staging.length > 0), lines: metastatic.length ? metastatic.filter(p => p.lines.length > 0).length / metastatic.length : 1 },
    lineReviewRate: lines.length ? lines.filter(l => l.reviewStatus !== "unreviewed").length / lines.length : 1,
    consent: { followUp: has(p => p.consent.followUp), research: has(p => p.consent.research), pharmaDeidentified: has(p => p.consent.pharmaDeidentified) },
  };
}
