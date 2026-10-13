import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { generateCohort, generateEdgeCases, checksumOf } from "../lib/seed/generator";
import { validatePatients } from "../lib/seed/validate";
import { Patient } from "../lib/domain/types";
const SEED = 20261013, VERSION = "gen-v3", CUTOFF = "2026-10-13", N = 2000;
mkdirSync("data/seed", { recursive: true });
const anchors = Patient.array().parse(JSON.parse(readFileSync("data/seed/anchors.json", "utf8")));
const cohort = generateCohort({ seed: SEED, n: N, cutoff: CUTOFF });
const errs = validatePatients([...anchors, ...cohort], CUTOFF);
if (errs.length) { console.error(errs.slice(0, 20)); process.exit(1); }
const edge = generateEdgeCases();
writeFileSync("data/seed/cohort.json", JSON.stringify(cohort));
writeFileSync("data/seed/edge-cases.json", JSON.stringify(edge));
writeFileSync("data/seed/manifest.json", JSON.stringify({ seed: SEED, version: VERSION, cutoff: CUTOFF, checksum: checksumOf(cohort), counts: { anchors: anchors.length, cohort: cohort.length, edgeCases: edge.length }, violations: 0 }, null, 2));
console.log("seed ok", checksumOf(cohort));
