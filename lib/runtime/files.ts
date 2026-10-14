import { readFileSync } from "node:fs";

/** Workers use the immutable bundle; local Next.js keeps reading project files. */
export function readDemoFile(name: string): string {
  const files = (globalThis as typeof globalThis & { __demoFiles?: Record<string, string> }).__demoFiles;
  if (files && Object.hasOwn(files, name)) return files[name];
  return readFileSync(name, "utf8");
}
