import type { DemoStore } from "./store";
import type { Patient } from "@/lib/domain/types";

type StoredDemo = { version: 1; store: Omit<DemoStore, "patients"> & { patients: Patient[] } };

/** Gzip keeps the synthetic cohort and research snapshots within SQLite value limits. */
export async function encodeDemoStore(store: DemoStore): Promise<Uint8Array> {
  const value: StoredDemo = { version: 1, store: { ...store, patients: [...store.patients.values()] } };
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodeDemoStore(encoded: Uint8Array): Promise<DemoStore> {
  const stream = new Blob([Uint8Array.from(encoded).buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  const saved = JSON.parse(await new Response(stream).text()) as StoredDemo;
  if (saved.version !== 1 || !Array.isArray(saved.store?.patients)) throw new Error("Unsupported demo snapshot");
  return { ...saved.store, patients: new Map(saved.store.patients.map(p => [p.id, p])) };
}
