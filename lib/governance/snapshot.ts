import { getStore } from "@/lib/state/store";
import { now, newId } from "@/lib/state/clock";
import { applyFilter, qualityMetrics } from "@/lib/compute";
import type { Cohort, CohortFilter, Patient, ResearchSnapshot } from "@/lib/domain/types";
import { inferLines } from "@/lib/domain/lines";
export function createCohort(name: string, filter: CohortFilter, createdBy: string): Cohort {
  const s = getStore(); const patientIds = applyFilter([...s.patients.values()], filter).map(p => p.id);
  const c: Cohort = { id: newId("cohort"), name, filter, createdBy, createdAt: now(), patientIds, status: "draft" }; s.cohorts.push(c); return c;
}
export function submitCohort(id: string): Cohort { const s = getStore(); const c = s.cohorts.find(x => x.id === id); if (!c) throw new Error("cohort not found"); c.status = "submitted"; return c; }
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
/**
 * De-identified copy of a live patient as it was known at the cutoff: treatments starting after it are dropped, treatments
 * ending after it are ongoing; outcomes, PROs and adherence logs after it are dropped; lastContact is capped at the cutoff;
 * biomarkers entered after it (enteredAt, defaulting to the specimen date) are dropped. Lines are re-inferred from the clipped
 * treatments, keeping the review status of lines whose event ids are unchanged.
 */
export function snapshotPatient(p: Patient, cutoff: string): Patient {
  const q = structuredClone(p); q.anchorKey = null; delete q.expertNote;
  q.biomarkers = q.biomarkers.filter(b => (b.enteredAt ?? b.specimenDate).slice(0, 10) <= cutoff);
  q.treatments = q.treatments.filter(t => t.start === null || t.start <= cutoff);
  for (const t of q.treatments) if (t.end !== null && t.end > cutoff) { t.end = null; t.stopReason = "ongoing"; }
  q.outcomes = q.outcomes.filter(o => o.date <= cutoff);
  q.pro = q.pro.filter(r => r.submittedAt.slice(0, 10) <= cutoff);
  q.adherence = q.adherence.filter(a => a.date <= cutoff);
  if (q.lastContact > cutoff) q.lastContact = cutoff;
  if (q.stage === "deceased" && !q.outcomes.some(o => o.type === "death")) q.stage = "metastatic"; // death after the cutoff is not yet known
  q.lines = inferLines(q.treatments).map(l => {
    const old = p.lines.find(x => sameIds(x.eventIds, l.eventIds));
    return old ? { ...l, rulesVersion: old.rulesVersion, reviewStatus: old.reviewStatus, reviewer: old.reviewer } : l;
  });
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
