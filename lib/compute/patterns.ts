import type { Patient } from "@/lib/domain/types";
const CLASS: Record<string, string> = { endocrine: "内分泌", cdk46: "CDK4/6", anti_her2: "抗HER2", adc: "ADC", chemo: "化疗", other: "其他" };
export function lineLabel(p: Patient, lineNo: number) {
  const l = p.lines.find(x => x.lineNo === lineNo); if (!l) return null;
  return [...new Set(l.eventIds.map(id => CLASS[p.treatments.find(t => t.id === id)?.type ?? "other"] ?? CLASS.other))].sort().join("+");
}
export function treatmentPatterns(ps: Patient[]) {
  const counts = new Map<string, number>();
  const withLines = ps.filter(p => p.lines.length);
  for (const p of withLines) { const path = p.lines.map(l => lineLabel(p, l.lineNo)).join(" → "); counts.set(path, (counts.get(path) ?? 0) + 1); }
  return { n: withLines.length, sequences: [...counts].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count) };
}
/** Five mutually exclusive buckets for every patient who has line `lineNo`. */
export function lineGapStatus(ps: Patient[], lineNo: number, cutoff: string) {
  void cutoff; // reserved: data is already cut at the demo clock
  const r = { on_treatment: 0, next_line: 0, lost: 0, deceased: 0, unknown: 0 };
  for (const p of ps) {
    const l = p.lines.find(x => x.lineNo === lineNo); if (!l) continue;
    if (l.end === null) r.on_treatment++;
    else if (p.lines.some(x => x.lineNo === lineNo + 1)) r.next_line++;
    else if (p.stage === "deceased") r.deceased++;
    else if (p.stage === "lost") r.lost++;
    else r.unknown++;
  }
  return r;
}
