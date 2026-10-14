import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const SOURCE_PATHS = [
  "app", "components", "lib", "data", "public", "scripts", "cloudflare/worker.mjs", "docs/demo-script.md",
  "package.json", "package-lock.json", "next.config.ts", "open-next.config.ts", "tsconfig.json",
  "wrangler.jsonc", "postcss.config.mjs", "eslint.config.mjs",
];
const GENERATED_DIRS = new Set([".git", ".claude", ".next", ".open-next", ".wrangler", "node_modules"]);
const MODES = new Set(["production", "development", "test"]);
const environmentFile = (name: string) => name.startsWith(".env") || name.startsWith(".dev.vars");

/** Keep build-time credentials and Next/OpenNext bypass switches out of child processes. */
export function workerBuildEnv(parent: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const name of ["PATH", "HOME", "USERPROFILE", "SystemRoot", "ComSpec", "PATHEXT", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL"])
    if (parent[name] !== undefined) env[name] = parent[name];
  return { ...env, CI: "1", NEXT_TELEMETRY_DISABLED: "1", WRANGLER_SEND_METRICS: "false", DEMO_FIXED_NOW: "2026-10-13T10:00:00+08:00" };
}

function copySource(sourceRoot: string, workspace: string): void {
  for (const name of SOURCE_PATHS) {
    const source = join(sourceRoot, name), target = join(workspace, name);
    let ancestor = sourceRoot;
    for (const segment of name.split("/")) {
      ancestor = join(ancestor, segment);
      if (lstatSync(ancestor).isSymbolicLink()) throw new Error("Worker build refuses source symlinks");
    }
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, {
      recursive: true,
      filter(path) {
        const entry = basename(path);
        if (environmentFile(entry) || GENERATED_DIRS.has(entry) || entry.endsWith(".tsbuildinfo") || entry.endsWith(".generated.mjs")) return false;
        if (lstatSync(path).isSymbolicLink()) throw new Error("Worker build refuses source symlinks");
        return true;
      },
    });
  }
  // Real copies keep Next's standalone tracing inside the isolated root. Preserve relative .bin links.
  const dependencies = join(sourceRoot, "node_modules");
  cpSync(dependencies, join(workspace, "node_modules"), {
    recursive: true, verbatimSymlinks: true,
    filter(path) {
      if (environmentFile(basename(path))) return false;
      if (lstatSync(path).isSymbolicLink()) {
        const link = readlinkSync(path), target = relative(dependencies, resolve(dirname(path), link));
        if (isAbsolute(link) || target === ".." || target.startsWith("../") || target.startsWith("..\\") || isAbsolute(target))
          throw new Error("Worker build refuses external dependency symlinks");
      }
      return true;
    },
  });
}

function rejectEnvironmentFiles(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (environmentFile(entry.name)) throw new Error("Worker artifact contains an environment file");
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Worker artifact contains a symlink");
    if (entry.isDirectory()) rejectEnvironmentFiles(path);
  }
}

/** Parse the compiler's JSON-only exports without evaluating its generated JavaScript. */
export function validateWorkerArtifacts(workspace: string): void {
  const artifactRoot = join(workspace, ".open-next");
  const environmentModule = join(artifactRoot, "cloudflare/next-env.mjs");
  if (!existsSync(environmentModule)) throw new Error("Worker environment module is missing");
  const seen = new Set<string>();
  for (const line of readFileSync(environmentModule, "utf8").trim().split(/\r?\n/)) {
    const match = /^export const (production|development|test) = (.*);$/.exec(line);
    if (!match || seen.has(match[1])) throw new Error("Unexpected Worker environment module format");
    let value: unknown;
    try { value = JSON.parse(match[2]); } catch { throw new Error("Invalid Worker environment JSON"); }
    if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length)
      throw new Error("Worker environment exports must be empty");
    seen.add(match[1]);
  }
  if (seen.size !== MODES.size) throw new Error("Worker environment modes are incomplete");
  rejectEnvironmentFiles(artifactRoot);
  for (const file of [".open-next/worker.js", "cloudflare/files.generated.mjs"])
    if (!lstatSync(join(workspace, file)).isFile()) throw new Error("Worker build artifact is missing or invalid");
}

type BuildRunner = (workspace: string, env: NodeJS.ProcessEnv) => void;
function runBuild(workspace: string, env: NodeJS.ProcessEnv): void {
  const options = { cwd: workspace, env, stdio: "inherit" as const };
  const tsx = join(workspace, "node_modules/tsx/dist/cli.mjs");
  execFileSync(process.execPath, [tsx, "scripts/generate-seed.ts"], options);
  execFileSync(process.execPath, [tsx, "scripts/build-worker-files.ts"], options);
  execFileSync(process.execPath, [join(workspace, "node_modules/@opennextjs/cloudflare/dist/cli/index.js"), "build"], options);
}

function publishArtifacts(workspace: string, sourceRoot: string): void {
  // Sibling backups and incoming files stay on the same filesystem as the final outputs.
  const publishRoot = join(sourceRoot, ".wrangler");
  mkdirSync(publishRoot, { recursive: true });
  const pending = mkdtempSync(join(publishRoot, "worker-artifacts-"));
  const artifacts = [".open-next", "cloudflare/files.generated.mjs"].map((name, index) => ({
    source: join(workspace, name), target: join(sourceRoot, name),
    incoming: join(pending, `incoming-${index}`), backup: join(pending, `previous-${index}`),
    installed: false,
  }));
  let cleanup = true;
  try {
    for (const artifact of artifacts) cpSync(artifact.source, artifact.incoming, { recursive: true });
    try {
      for (const artifact of artifacts) if (existsSync(artifact.target)) renameSync(artifact.target, artifact.backup);
      for (const artifact of artifacts) { renameSync(artifact.incoming, artifact.target); artifact.installed = true; }
    } catch (cause) {
      let rollbackFailed = false;
      for (const artifact of [...artifacts].reverse()) {
        try {
          if (artifact.installed) rmSync(artifact.target, { recursive: true, force: true });
          if (existsSync(artifact.backup)) renameSync(artifact.backup, artifact.target);
        } catch { rollbackFailed = true; }
      }
      if (rollbackFailed) {
        cleanup = false;
        throw new Error(`Worker artifact restore failed; backups retained at ${pending}`, { cause });
      }
      throw cause;
    }
  } finally {
    if (cleanup) rmSync(pending, { recursive: true, force: true });
  }
}

/** Build from a fresh snapshot, validate, then publish only the two deployment artifacts. */
export function buildWorkerBundle(options: { sourceRoot: string; runBuild?: BuildRunner; env?: NodeJS.ProcessEnv }): void {
  const sourceRoot = realpathSync(options.sourceRoot);
  const workspace = mkdtempSync(join(tmpdir(), "med-test-worker-build-"));
  try {
    copySource(sourceRoot, workspace);
    (options.runBuild ?? runBuild)(workspace, workerBuildEnv(options.env ?? process.env));
    validateWorkerArtifacts(workspace);
    publishArtifacts(workspace, sourceRoot);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
