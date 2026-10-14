import { SEED_FILES } from '../lib/runtime/seedFiles';
import { createHash } from "node:crypto";

/** Cover all seed inputs, including anchors that the cohort checksum does not cover. */
export function fingerprintSeed(files: Record<string, string>): string {
  const hash = createHash("sha256");
  for (const path of SEED_FILES) {
    if (typeof files[path] !== "string") throw new Error(`Missing Worker seed file: ${path}`);
    hash.update(path).update("\0").update(files[path]).update("\0");
  }
  return hash.digest("hex");
}
