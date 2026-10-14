import { createHash } from "node:crypto";

/** Cover all seed inputs, including anchors that the cohort checksum does not cover. */
export function fingerprintSeed(files: Record<string, string>): string {
  const hash = createHash("sha256");
  for (const name of ["anchors", "cohort", "edge-cases", "manifest"]) {
    const path = `data/seed/${name}.json`;
    if (typeof files[path] !== "string") throw new Error(`Missing Worker seed file: ${path}`);
    hash.update(path).update("\0").update(files[path]).update("\0");
  }
  return hash.digest("hex");
}
