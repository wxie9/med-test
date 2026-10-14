import { getStore } from "@/lib/state/store";
import { now, newId } from "@/lib/state/clock";
import { applyFilter, qualityMetrics } from "@/lib/compute";
import type { Cohort, CohortFilter, Patient, ResearchSnapshot } from "@/lib/domain/types";
import { inferLines } from "@/lib/domain/lines";
import { DateOnly } from "@/lib/domain/dateSchema";
import { diffDays } from "@/lib/domain/dates";
import { DEFAULT_CUTOFF } from "@/lib/seed/validate";
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
const shanghaiDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
function recordDay(value: string): string {
  if (DateOnly.safeParse(value).success) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "9999-12-31" : shanghaiDay.format(date);
}
function stageAtCutoff(p: Patient, cutoff: string, sourceCutoff: string): Patient["stage"] {
  if (p.outcomes.some(o => o.type === "death")) return "deceased";
  // The synthetic source defines lost follow-up as >200 days without contact. There is no separate loss timestamp.
  if (p.stage === "lost" && diffDays(p.lastContact, cutoff) > 200) return "lost";
  if (p.outcomes.some(o => o.type === "distant_metastasis")) return "metastatic";
  // Survivorship is itself known at the source cutoff, even where completion details were incompletely recorded.
  // Death/metastasis still require retained dated outcomes, including when a live record contains later edits.
  if (cutoff >= sourceCutoff && p.stage === "survivorship") return "survivorship";
  const adjuvant = p.treatments.filter(t => t.intent === "adjuvant" && t.type !== "surgery");
  if (adjuvant.some(t => t.type === "endocrine" && t.end !== null && t.stopReason === "completed") &&
      adjuvant.every(t => t.end !== null)) return "survivorship";
  return "early_adjuvant";
}
/**
 * De-identified, cutoff-bounded clinical records; historical stages are derived from retained evidence. Both specimen and recording
 * dates must be known by the Shanghai cutoff day. Age remains an unversioned source demographic, not historical age.
 * Before sourceCutoff, untimed genomics are masked as not_tested (no cutoff-known result), and fully undated therapies
 * are omitted. At sourceCutoff those facts and the source survivorship status are known. Death/metastasis require retained
 * dated outcomes at every cutoff. Lines with unchanged event ids keep their review.
 */
export function snapshotPatient(p: Patient, cutoff: string, sourceCutoff: string = DEFAULT_CUTOFF): Patient {
  DateOnly.parse(cutoff);
  DateOnly.parse(sourceCutoff);
  const q = structuredClone(p); q.anchorKey = null; delete q.expertNote;
  q.biomarkers = q.biomarkers.filter(b => recordDay(b.specimenDate) <= cutoff && recordDay(b.enteredAt ?? b.specimenDate) <= cutoff);
  q.staging = q.staging.filter(s => recordDay(s.date) <= cutoff);
  if (q.surgeryDate !== null && recordDay(q.surgeryDate) > cutoff) q.surgeryDate = null;
  q.treatments = q.treatments.filter(t => t.start !== null ? recordDay(t.start) <= cutoff :
    cutoff >= sourceCutoff || (t.end !== null && recordDay(t.end) <= cutoff));
  for (const t of q.treatments) if (t.end !== null && t.end > cutoff) { t.end = null; t.stopReason = "ongoing"; }
  q.outcomes = q.outcomes.filter(o => recordDay(o.date) <= cutoff);
  q.pro = q.pro.filter(r => recordDay(r.submittedAt) <= cutoff);
  q.adherence = q.adherence.filter(a => recordDay(a.date) <= cutoff);
  if (q.lastContact > cutoff) q.lastContact = cutoff;
  q.stage = stageAtCutoff(q, cutoff, sourceCutoff);
  if (cutoff < sourceCutoff) q.genomics = { brca: "not_tested", pik3ca: "not_tested", esr1: "not_tested" };
  q.lines = inferLines(q.treatments).map(l => {
    const old = p.lines.find(x => sameIds(x.eventIds, l.eventIds));
    return old ? { ...l, rulesVersion: old.rulesVersion, reviewStatus: old.reviewStatus, reviewer: old.reviewer } : l;
  });
  return q;
}
/** Immutable copy of frozen cohort membership, limited to patients enrolled and pharma-consented by the cutoff. */
export function createSnapshot(cohortId: string, cutoff: string): ResearchSnapshot {
  DateOnly.parse(cutoff);
  const s = getStore(); const c = s.cohorts.find(x => x.id === cohortId); if (!c || c.status !== "submitted") throw new Error("cohort must be submitted");
  const patients = c.patientIds.map(id => s.patients.get(id)).filter((p): p is Patient => !!p && recordDay(p.enrolledAt) <= cutoff &&
    p.consent.pharmaDeidentified && p.consent.signedAt !== null && recordDay(p.consent.signedAt) <= cutoff)
    .map(p => snapshotPatient(p, cutoff, s.manifest.cutoff));
  const q = qualityMetrics(patients);
  const snap: ResearchSnapshot = { id: `SNAP-${cutoff}-v${s.snapshots.length + 1}`, cohortId, cutoff, createdAt: now(), patients, quality: { subtype: q.completeness.subtype, stage: q.completeness.stage, lines: q.completeness.lines, lineReviewRate: q.lineReviewRate, n: q.n } };
  s.snapshots.push(deepFreeze(snap)); return snap;
}
