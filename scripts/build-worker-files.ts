import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fingerprintSeed } from "./seed-fingerprint";
// Explicit allowlist: never bundle environment files, keys, or private proposals.
const names = ["data/seed/anchors.json", "data/seed/cohort.json", "data/seed/edge-cases.json", "data/seed/manifest.json", "docs/demo-script.md"];
const files = Object.fromEntries(names.map(name => [name, readFileSync(name, "utf8")]));
mkdirSync("cloudflare", { recursive: true });
writeFileSync("cloudflare/files.generated.mjs", `export const seedFingerprint = "${fingerprintSeed(files)}";\nexport default ${JSON.stringify(files)};\n`);
console.log("Bundled synthetic seed and demo script for Workers");
