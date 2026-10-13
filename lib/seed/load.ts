import { readFileSync } from "node:fs";
import { Patient } from "@/lib/domain/types";
import { inferLines } from "@/lib/domain/lines";
export type Manifest = { seed: number; version: string; cutoff: string; checksum: string; counts: Record<string, number> };
const read = (f: string) => JSON.parse(readFileSync(`data/seed/${f}`, "utf8"));
export function loadSeed() {
  const anchors = Patient.array().parse(read("anchors.json")).map(p => ({ ...p, lines: p.lines.length ? p.lines : inferLines(p.treatments).map(l => ({ ...l, reviewStatus: "confirmed" as const, reviewer: "Dr. Mock" })) }));
  return { anchors, cohort: Patient.array().parse(read("cohort.json")), edgeCases: Patient.array().parse(read("edge-cases.json")), manifest: read("manifest.json") as Manifest };
}
