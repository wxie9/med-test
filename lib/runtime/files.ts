import { readFileSync } from "node:fs";

/** Workers use the immutable bundle; local Next.js keeps reading project files. */
export function readDemoFile(name: string): string {
  const files = (globalThis as typeof globalThis & { __demoFiles?: Record<string, string> }).__demoFiles;
  if (files) {
    if (!Object.hasOwn(files, name)) throw new Error(`Missing bundled demo file: ${name}`);
    return files[name];
  }
  return readFileSync(name, "utf8");
}
