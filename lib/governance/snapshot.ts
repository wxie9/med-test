import { getStore } from "@/lib/state/store";
import { now, newId } from "@/lib/state/clock";
import { applyFilter, qualityMetrics } from "@/lib/compute";
import type { Cohort, CohortFilter, Patient, ResearchSnapshot } from "@/lib/domain/types";
export function createCohort(name: string, filter: CohortFilter, createdBy: string): Cohort {
  const s = getStore(); const patientIds = applyFilter([...s.patients.values()], filter).map(p => p.id);
  const c: Cohort = { id: newId("cohort"), name, filter, createdBy, createdAt: now(), patientIds, status: "draft" }; s.cohorts.push(c); return c;
}
export function submitCohort(id: string): Cohort { const s = getStore(); const c = s.cohorts.find(x => x.id === id); if (!c) throw new Error("cohort not found"); c.status = "submitted"; return c; }
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
/** De-identified, cutoff-bounded copy of a live patient (results entered after the cutoff are not yet "known"). */
function snapshotPatient(p: Patient, cutoff: string): Patient {
  const q = structuredClone(p); q.anchorKey = null; delete q.expertNote;
  q.biomarkers = q.biomarkers.filter(b => !(b.enteredAt && b.enteredAt.slice(0, 10) > cutoff));
  return q;
}
/** Immutable research snapshot of a submitted cohort; only patients with pharma de-identified consent are included. */
export function createSnapshot(cohortId: string, cutoff: string): ResearchSnapshot {
  const s = getStore(); const c = s.cohorts.find(x => x.id === cohortId); if (!c || c.status !== "submitted") throw new Error("cohort must be submitted");
  const patients = c.patientIds.map(id => s.patients.get(id)).filter((p): p is Patient => !!p && p.consent.pharmaDeidentified).map(p => snapshotPatient(p, cutoff));
  const q = qualityMetrics(patients);
  const snap: ResearchSnapshot = { id: `SNAP-${cutoff}-v${s.snapshots.length + 1}`, cohortId, cutoff, createdAt: now(), patients, quality: { subtype: q.completeness.subtype, stage: q.completeness.stage, lines: q.completeness.lines, lineReviewRate: q.lineReviewRate, n: q.n } };
  s.snapshots.push(deepFreeze(snap)); return snap;
}
