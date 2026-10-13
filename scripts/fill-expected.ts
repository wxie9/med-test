import { readFileSync, writeFileSync } from "node:fs";
import { getStore } from "../lib/state/store";
import { applyFilter } from "../lib/compute";
import type { CohortFilter } from "../lib/domain/types";
type Entry = { key: string; filter: CohortFilter; expectedCount: number | null };
const FILE = "data/seed/expected.json";
const entries = JSON.parse(readFileSync(FILE, "utf8")) as Entry[];
const all = [...getStore().patients.values()];
for (const e of entries) { e.expectedCount = applyFilter(all, e.filter).length; console.log(`${e.key}: ${e.expectedCount}`); }
writeFileSync(FILE, "[\n" + entries.map(e => "  " + JSON.stringify(e)).join(",\n") + "\n]\n");
