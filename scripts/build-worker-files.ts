import { WORKER_FILES } from '../lib/runtime/seedFiles';
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fingerprintSeed } from "./seed-fingerprint";
// Explicit allowlist: never bundle environment files, keys, or private proposals.
const names = WORKER_FILES;
const files = Object.fromEntries(names.map(name => [name, readFileSync(name, "utf8")]));
mkdirSync("cloudflare", { recursive: true });
writeFileSync("cloudflare/files.generated.mjs", `export const seedFingerprint = "${fingerprintSeed(files)}";\nexport default ${JSON.stringify(files)};\n`);
console.log("Bundled synthetic seed and demo script for Workers");
