import { loadSeed, type Manifest } from "@/lib/seed/load";
import { pharmaView } from "@/lib/research/pharmaView";
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
/** Cohort without its patient id list (an "all patients" cohort would otherwise add ~2000 ids to every poll). */
export function cohortSummary(c: Cohort) { const { patientIds, ...rest } = c; return { ...rest, patientCount: patientIds.length }; }
export type CohortSummary = ReturnType<typeof cohortSummary>;
/** Lite state for clinic/governance polls: no patient payloads, no patient messages, candidate requests as count-only summaries. */
export function serializeLite(s: DemoStore) {
  const { patients, snapshots, cohorts, candidateRequests, messages, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars -- messages are dropped on purpose (read per patient via /api/patients/:id)
  return { ...rest, cohorts: cohorts.map(cohortSummary), snapshots: snapshots.map(snapshotSummary), candidateRequests: candidateRequests.map(pharmaView), patientCount: patients.size };
}
/** Research (pharma) portal state: only de-identified summaries; no alerts, tasks, messages, gap tasks or patient ids. */
export function serializeResearch(s: DemoStore) {
  return {
    snapshots: s.snapshots.map(snapshotSummary), cohorts: s.cohorts.map(c => ({ id: c.id, name: c.name, patientCount: c.patientIds.length })),
    candidateRequests: s.candidateRequests.map(pharmaView), manifest: s.manifest, agentMode: s.agentMode, seedVersion: s.seedVersion,
  };
}
export type ResearchState = ReturnType<typeof serializeResearch> & { serverNow: string };
