import { afterEach, expect, it, vi } from "vitest";
import anchors from "@/data/seed/anchors.json";
import manifest from "@/data/seed/manifest.json";
import { loadSeed } from "@/lib/seed/load";

vi.mock("node:fs", () => ({ readFileSync: () => { throw new Error("filesystem unavailable in Worker"); } }));
const runtime = globalThis as typeof globalThis & { __demoFiles?: Record<string, string> };
afterEach(() => { delete runtime.__demoFiles; });
it("loads the complete synthetic seed from bundled files without local filesystem access", () => {
  runtime.__demoFiles = {
    "data/seed/anchors.json": JSON.stringify(anchors),
    "data/seed/cohort.json": "[]",
    "data/seed/edge-cases.json": "[]",
    "data/seed/manifest.json": JSON.stringify(manifest),
  };
  const seed = loadSeed();
  expect(seed.anchors).toHaveLength(12);
  expect(seed.anchors.find(p => p.id === "P-A")?.anchorKey).toBe("A");
  expect(seed.manifest.checksum).toBe(manifest.checksum);
});

it('loads PSP using the runtime bundle without filesystem access',async()=>{
 const {loadPspSeed}=await import('@/lib/psp/seed');
 const {default:psp}=await import('@/data/seed/psp.json');const {default:pspManifest}=await import('@/data/seed/psp-manifest.json');
 const {default:cohort}=await import('@/data/seed/cohort.json');
 runtime.__demoFiles={'data/seed/psp.json':JSON.stringify(psp),'data/seed/psp-manifest.json':JSON.stringify(pspManifest)};
 const {Patient}=await import('@/lib/domain/types');const patients=Patient.array().parse([...anchors,...cohort]);
 expect(loadPspSeed(new Map(patients.map(p=>[p.id,p]))).enrollments).toHaveLength(20);
 delete runtime.__demoFiles['data/seed/psp.json'];expect(()=>loadPspSeed(new Map(patients.map(p=>[p.id,p])))).toThrow();
});

it('reports incomplete runtime bundles without trying the local filesystem',async()=>{
 const {readDemoFile}=await import('@/lib/runtime/files');runtime.__demoFiles={};
 expect(()=>readDemoFile('data/seed/psp.json')).toThrow('Missing bundled demo file: data/seed/psp.json');
});
