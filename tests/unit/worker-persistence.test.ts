import { describe, expect, it } from "vitest";
import { getStore, resetStore } from "@/lib/state/store";
import { encodeDemoStore, decodeDemoStore } from "@/lib/state/persistence";

describe("Worker state persistence", () => {
  it("restores patients, snapshots, messages and reset generation after instance eviction", async () => {
    resetStore();
    const store = getStore();
    const patient = store.patients.get("P-A")!;
    patient.age = 47;
    store.messages.push({ id: "persisted", patientId: "P-A", kind: "plan_update", text: "2周后复评", at: "2026-10-13T02:00:00.000Z" });
    store.snapshots.push({ id: "SNAP-persisted", cohortId: "c1", cutoff: "2026-10-13", createdAt: "2026-10-13T02:00:00.000Z", patients: [structuredClone(patient)], quality: { n: 1 } });
    const saved = await encodeDemoStore(store);
    expect(saved.byteLength).toBeLessThan(2 * 1024 * 1024);
    resetStore();
    const restored = await decodeDemoStore(saved);
    expect(restored.patients).toBeInstanceOf(Map);
    expect(restored.patients.size).toBe(2012);
    expect(restored.patients.get("P-A")?.age).toBe(47);
    expect(restored.snapshots[0].patients[0].id).toBe("P-A");
    expect(restored.messages[0].text).toBe("2周后复评");
    expect(restored.seedVersion).toBe(store.seedVersion);
    expect(getStore().messages).toHaveLength(0);
  });
});

it('rejects v1 and malformed PSP payload and rehydrates frozen snapshots', async()=>{
 resetStore(); const store=getStore(); store.snapshots.push({id:'s',cohortId:'c',cutoff:'2026-10-13',createdAt:'2026-10-13T00:00:00Z',patients:[structuredClone(store.patients.get('P-A')!)],quality:{n:1}});
 const restored=await decodeDemoStore(await encodeDemoStore(store)); expect(Object.isFrozen(restored.snapshots[0].patients[0])).toBe(true); expect(Object.isFrozen(restored.psp.enrollments[0])).toBe(false);
 async function gzip(value:unknown){return new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());}
 await expect(decodeDemoStore(await gzip({version:1,store:{...store,patients:[...store.patients.values()]}}))).rejects.toThrow();
 await expect(decodeDemoStore(await gzip({version:2,store:{...store,psp:{...store.psp,ledgerRevision:-1},patients:[...store.patients.values()]}}))).rejects.toThrow();
});

it('rejects malformed nested clinical fields and unknown data',async()=>{
 resetStore();const s=getStore();const p=s.patients.get('P-A')!;Object.assign(p.biomarkers[0],{unknownClinicalField:1});await expect(encodeDemoStore(s)).rejects.toThrow();
 resetStore();getStore().psp.permissionEvents[0].occurredAt='2026-10-14T00:00:00.000Z';await expect(encodeDemoStore(getStore())).rejects.toThrow();
});
