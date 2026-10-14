import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildWorkerBundle, workerBuildEnv, validateWorkerArtifacts } from "@/scripts/worker-build-policy";

const roots: string[] = [];
const sentinel = "synthetic-worker-env-regression-only";
const emptyEnv = ["production", "development", "test"].map(mode => `export const ${mode} = {};\n`).join("");
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "med-worker-policy-test-"));
  roots.push(root);
  for (const dir of ["app", "components", "lib", "data/seed", "public", "scripts", "cloudflare", "docs", "node_modules"])
    mkdirSync(join(root, dir), { recursive: true });
  for (const file of ["package.json", "package-lock.json", "next.config.ts", "open-next.config.ts", "tsconfig.json", "wrangler.jsonc", "postcss.config.mjs", "eslint.config.mjs", "cloudflare/worker.mjs", "docs/demo-script.md"])
    writeFileSync(join(root, file), file.endsWith(".json") ? "{}" : "// safe fixture\n");
  writeFileSync(join(root, "app/page.tsx"), "export default function Page() { return null; }\n");
  writeFileSync(join(root, "node_modules/dependency-marker"), "copied dependencies");
  mkdirSync(join(root, ".next"));
  writeFileSync(join(root, ".next/local-marker"), "local Next build must remain intact");
  for (const file of [".env", ".env.local", ".env.production", ".env.production.local", ".env.development", ".env.development.local", ".env.test", ".env.test.local", ".dev.vars", ".dev.vars.preview", "public/.env.secret", "lib/.env.local"])
    writeFileSync(join(root, file), `DEMO_OPENAI_API_KEY=${sentinel}\nDEMO_CLAUDE_API_KEY=${sentinel}\n`);
  return root;
}
function output(root: string, env = emptyEnv) {
  mkdirSync(join(root, ".open-next/cloudflare"), { recursive: true });
  writeFileSync(join(root, ".open-next/cloudflare/next-env.mjs"), env);
  writeFileSync(join(root, ".open-next/worker.js"), "export default {};\n");
  writeFileSync(join(root, "cloudflare/files.generated.mjs"), "export default {};\n");
}
function artifactFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? artifactFiles(path) : [path];
  });
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("Worker build isolation", () => {
  it("reproduces the upstream compiler embedding a synthetic key from the source dotenv files", async () => {
    const root = fixture(); output(root);
    const compilerPath = resolve("node_modules/@opennextjs/cloudflare/dist/cli/build/open-next/compile-env-files.js");
    const { compileEnvFiles } = await import(pathToFileURL(compilerPath).href);
    compileEnvFiles({ appPath: root, monorepoRoot: root, outputDir: join(root, ".open-next") });
    expect(readFileSync(join(root, ".open-next/cloudflare/next-env.mjs"), "utf8").includes(sentinel)).toBe(true);
  });
  it("keeps all dotenv variants out of the real OpenNext environment compiler and preserves local inputs", async () => {
    const root = fixture();
    const original = readFileSync(join(root, ".env.local"), "utf8");
    const compilerPath = resolve("node_modules/@opennextjs/cloudflare/dist/cli/build/open-next/compile-env-files.js");
    const { compileEnvFiles } = await import(pathToFileURL(compilerPath).href);
    let staging = "";
    buildWorkerBundle({ sourceRoot: root, runBuild(workspace, env) {
      staging = workspace;
      expect(existsSync(join(workspace, ".env.local"))).toBe(false);
      expect(existsSync(join(workspace, "public/.env.secret"))).toBe(false);
      expect(existsSync(join(workspace, "lib/.env.local"))).toBe(false);
      expect(existsSync(join(workspace, ".next/local-marker"))).toBe(false);
      expect(readFileSync(join(workspace, "node_modules/dependency-marker"), "utf8")).toBe("copied dependencies");
      expect(env.DEMO_OPENAI_API_KEY).toBeUndefined();
      output(workspace);
      compileEnvFiles({ appPath: workspace, monorepoRoot: workspace, outputDir: join(workspace, ".open-next") });
    } });
    expect(readFileSync(join(root, ".open-next/cloudflare/next-env.mjs"), "utf8")).toBe(emptyEnv);
    for (const file of [...artifactFiles(join(root, ".open-next")), join(root, "cloudflare/files.generated.mjs")])
      expect(readFileSync(file).includes(Buffer.from(sentinel))).toBe(false);
    expect(readFileSync(join(root, ".env.local"), "utf8")).toBe(original);
    expect(readFileSync(join(root, ".next/local-marker"), "utf8")).toBe("local Next build must remain intact");
    expect(existsSync(staging)).toBe(false);
  });

  it("does not forward model keys, public variables or build bypasses to the child", () => {
    const env = workerBuildEnv({ PATH: "/safe/bin", HOME: "/safe/home", DEMO_OPENAI_API_KEY: sentinel,
      DEMO_CLAUDE_API_KEY: sentinel, NEXT_PUBLIC_SECRET: sentinel, NODE_OPTIONS: sentinel,
      npm_config_token: sentinel, NPM_CONFIG_TOKEN: sentinel, SKIP_NEXT_APP_BUILD: "true", OPEN_NEXT_DEBUG: "true", DEMO_FIXED_NOW: "wrong" });
    expect(env.PATH).toBe("/safe/bin");
    expect(env.HOME).toBe("/safe/home");
    expect(env.DEMO_FIXED_NOW).toBe("2026-10-13T10:00:00+08:00");
    expect(Object.values(env)).not.toContain(sentinel);
    expect(env.SKIP_NEXT_APP_BUILD).toBeUndefined();
    expect(env.CI).toBe("1");
  });

  it("rejects source symlinks rather than copying an external env file", () => {
    const root = fixture();
    symlinkSync(join(root, ".env.local"), join(root, "lib/linked-config.ts"));
    expect(() => buildWorkerBundle({ sourceRoot: root, runBuild() { throw new Error("must not run"); } })).toThrow(/symlink/i);
    expect(existsSync(join(root, ".open-next"))).toBe(false);
  });

  it("rejects dependency links that escape the isolated directory", () => {
    const root = fixture();
    symlinkSync("../.env.local", join(root, "node_modules/linked-secret"));
    expect(() => buildWorkerBundle({ sourceRoot: root, runBuild() { throw new Error("must not run"); } })).toThrow(/dependency symlink/i);
  });

  it("preserves safe relative dependency links inside the copied dependencies", () => {
    const root = fixture();
    mkdirSync(join(root, "node_modules/.bin"));
    symlinkSync("../dependency-marker", join(root, "node_modules/.bin/safe"));
    buildWorkerBundle({ sourceRoot: root, runBuild(workspace) {
      expect(readFileSync(join(workspace, "node_modules/.bin/safe"), "utf8")).toBe("copied dependencies");
      output(workspace);
    } });
  });

  it.each(["child failure", "unsafe output"])("preserves prior artifacts and removes staging after %s", kind => {
    const root = fixture(); output(root);
    const before = readFileSync(join(root, ".open-next/worker.js"), "utf8");
    let staging = "";
    expect(() => buildWorkerBundle({ sourceRoot: root, runBuild(workspace) {
      staging = workspace;
      if (kind === "child failure") throw new Error("synthetic child failure");
      output(workspace, emptyEnv.replace("production = {}", `production = {"DEMO_OPENAI_API_KEY":"${sentinel}"}`));
    } })).toThrow();
    expect(readFileSync(join(root, ".open-next/worker.js"), "utf8")).toBe(before);
    expect(existsSync(staging)).toBe(false);
  });

  it("restores both prior artifacts when publishing the generated seed file fails", () => {
    const root = fixture(); output(root);
    const priorWorker = "// previous worker\n", priorFiles = "// previous seed bundle\n";
    writeFileSync(join(root, ".open-next/worker.js"), priorWorker);
    writeFileSync(join(root, "cloudflare/files.generated.mjs"), priorFiles);
    chmodSync(join(root, "cloudflare/files.generated.mjs"), 0o444);
    chmodSync(join(root, "cloudflare"), 0o555);
    try {
      expect(() => buildWorkerBundle({ sourceRoot: root, runBuild(workspace) { output(workspace); } })).toThrow();
      expect(readFileSync(join(root, ".open-next/worker.js"), "utf8")).toBe(priorWorker);
      expect(readFileSync(join(root, "cloudflare/files.generated.mjs"), "utf8")).toBe(priorFiles);
    } finally {
      chmodSync(join(root, "cloudflare"), 0o755);
      chmodSync(join(root, "cloudflare/files.generated.mjs"), 0o644);
    }
  });
});

describe("Worker artifact validation", () => {
  it.each([
    emptyEnv.replace("production = {}", `production = {"DEMO_CLAUDE_API_KEY":"${sentinel}"}`),
    emptyEnv.replace("export const test = {};\n", ""),
    emptyEnv + "export const other = {};\n",
    emptyEnv + "globalThis.sideEffect = true;\n",
  ])("rejects nonempty, incomplete or executable environment modules", env => {
    const root = fixture(); output(root, env);
    expect(() => validateWorkerArtifacts(root)).toThrow(/environment/i);
  });
  it("rejects a dotenv file copied into the final assets", () => {
    const root = fixture(); output(root);
    mkdirSync(join(root, ".open-next/assets"));
    writeFileSync(join(root, ".open-next/assets/.env"), sentinel);
    expect(() => validateWorkerArtifacts(root)).toThrow(/environment/i);
  });
});
