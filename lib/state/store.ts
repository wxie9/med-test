import { loadSeed, type Manifest } from "@/lib/seed/load";
import type { Patient, Alert, FollowUpTask, Cohort, ResearchSnapshot, CandidateRequest, DataGapTask, PatientMessage } from "@/lib/domain/types";
export type AgentMode = "deterministic" | "claude" | "openai";
export type DemoStore = { patients: Map<string, Patient>; alerts: Alert[]; tasks: FollowUpTask[]; cohorts: Cohort[]; snapshots: ResearchSnapshot[]; candidateRequests: CandidateRequest[]; gapTasks: DataGapTask[]; messages: PatientMessage[]; manifest: Manifest; agentMode: AgentMode; seedVersion: number };
const g = globalThis as unknown as { __demoStore?: DemoStore };
function build(): DemoStore {
  const { anchors, cohort, manifest } = loadSeed();
  const patients = new Map<string, Patient>();
  // Deep-clone so runtime mutations never leak into seed objects, even if loadSeed() is memoized later.
  for (const p of [...anchors, ...cohort]) patients.set(p.id, structuredClone(p));
  const key = process.env.DEMO_CLAUDE_API_KEY ? "claude" : process.env.DEMO_OPENAI_API_KEY ? "openai" : "deterministic";
  return { patients, alerts: [], tasks: [], cohorts: [], snapshots: [], candidateRequests: [], gapTasks: [], messages: [], manifest, agentMode: key, seedVersion: (g.__demoStore?.seedVersion ?? 0) + 1 };
}
export function getStore(): DemoStore { if (!g.__demoStore) g.__demoStore = build(); return g.__demoStore; }
export function resetStore(): void { g.__demoStore = build(); }
export function serialize(s: DemoStore) { return { ...s, patients: [...s.patients.values()] }; }
/** Snapshot without its patient payload (API responses and the lite state stay small). */
export function snapshotSummary(snap: ResearchSnapshot) { const { patients, ...rest } = snap; return { ...rest, patientCount: patients.length }; }
export type SnapshotSummary = ReturnType<typeof snapshotSummary>;
export function serializeLite(s: DemoStore) { const { patients, snapshots, ...rest } = s; return { ...rest, snapshots: snapshots.map(snapshotSummary), patientCount: patients.size }; }
