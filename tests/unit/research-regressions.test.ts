import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "@/lib/domain/dates";
import { createCohort, createSnapshot, snapshotPatient, submitCohort } from "@/lib/governance/snapshot";
import { getStore, resetStore } from "@/lib/state/store";
import { applyFilter, PROTOCOL_ADC_301, qualityMetrics, runFunnel } from "@/lib/compute";
import { requestCandidates } from "@/lib/research/candidates";

const patient = (id = "P-L") => structuredClone(getStore().patients.get(id)!);
const allCohort = () => {
  const c = createCohort("all", {}, "x");
  submitCohort(c.id);
  return c;
};

describe("historical snapshot regressions", () => {
  beforeEach(() => resetStore());

  it("excludes future enrollees rather than producing negative follow-up", () => {
    const c = allCohort();
    const snapshot = createSnapshot(c.id, "2020-01-01");
    const eligible = c.patientIds.map(id => getStore().patients.get(id)!).filter(p =>
      p.enrolledAt <= snapshot.cutoff && p.consent.pharmaDeidentified && p.consent.signedAt !== null && p.consent.signedAt <= snapshot.cutoff);
    expect(snapshot.patients.map(p => p.id)).toEqual(eligible.map(p => p.id));
    expect(snapshot.patients.every(p => p.lastContact >= p.enrolledAt)).toBe(true);
  });

  it.each([null, "2026-10-14"])("excludes pharma consent without a signature by the cutoff (%s)", signedAt => {
    const p = getStore().patients.get("P-L")!;
    p.consent.signedAt = signedAt;
    expect(createSnapshot(allCohort().id, "2026-10-13").patients.map(p => p.id)).not.toContain(p.id);
  });

  it.each(["2026-02-31", "2026-99-99", "2026-1-01"])("rejects invalid direct snapshot cutoff %s without mutation", cutoff => {
    const c = allCohort();
    expect(() => createSnapshot(c.id, cutoff)).toThrow();
    expect(getStore().snapshots).toHaveLength(0);
    expect(() => snapshotPatient(patient(), cutoff)).toThrow();
  });

  it("derives early disease before a future metastasis", () => {
    const early = snapshotPatient(patient(), "2020-01-01");
    expect(early.stage).toBe("early_adjuvant");
    expect(early.outcomes).toHaveLength(0);
  });

  it("derives survivorship only after known completed adjuvant endocrine therapy", () => {
    const p = patient("P-H");
    expect(snapshotPatient(p, "2024-01-01").stage).toBe("early_adjuvant");
    expect(snapshotPatient(p, "2025-06-01").stage).toBe("survivorship");
    expect(snapshotPatient(patient(), "2024-01-01").stage).toBe("survivorship");
  });

  it("does not project a later loss to follow-up into an earlier snapshot", () => {
    const p = patient("P-I");
    expect(snapshotPatient(p, "2024-01-01").stage).toBe("early_adjuvant");
    expect(snapshotPatient(p, p.lastContact).stage).toBe("early_adjuvant");
    expect(snapshotPatient(p, addDays(p.lastContact, 201)).stage).toBe("lost");
  });

  it("clips future surgery and staging records without changing the live record", () => {
    const p = patient("P-A");
    p.staging.push({ cTnm: "cT4N2M1", pTnm: null, date: "2026-10-14", system: "AJCC8" });
    const copy = snapshotPatient(p, "2025-07-05");
    expect(copy.surgeryDate).toBeNull();
    expect(copy.staging).toEqual(p.staging.filter(s => s.date <= "2025-07-05"));
    expect(p.surgeryDate).toBe("2025-07-10");
    expect(p.staging).toHaveLength(2);
  });

  it("requires both specimen and recorded dates to be cutoff-known", () => {
    const p = patient();
    p.biomarkers.push({ ...p.biomarkers[0], id: "future-specimen", specimenDate: "2026-10-14", enteredAt: "2026-09-01" });
    expect(snapshotPatient(p, "2026-10-13").biomarkers.map(b => b.id)).not.toContain("future-specimen");
  });

  it("uses the Shanghai cutoff day for timed records and signatures", () => {
    const p = getStore().patients.get("P-L")!;
    p.biomarkers[1].enteredAt = "2026-09-20T16:30:00Z";
    p.pro = [{ id: "late-local-day", scaleId: "treatment_weekly_v1", submittedAt: "2026-09-20T16:30:00Z", items: {}, flags: {} }];
    expect(snapshotPatient(p, "2026-09-20").biomarkers.map(b => b.id)).not.toContain("P-L-b2");
    expect(snapshotPatient(p, "2026-09-20").pro).toHaveLength(0);
    p.consent.signedAt = "2026-09-20T16:30:00Z";
    expect(createSnapshot(allCohort().id, "2026-09-20").patients.map(p => p.id)).not.toContain("P-L");
  });

  it("masks untimed genomic results and fully undated therapies before the source cutoff", () => {
    const p = patient("P-G");
    p.genomics = { brca: "positive", pik3ca: "mutated", esr1: "mutated" };
    const early = snapshotPatient(p, "2026-09-01");
    expect(early.genomics).toEqual({ brca: "not_tested", pik3ca: "not_tested", esr1: "not_tested" });
    expect(early.treatments.map(t => t.id)).not.toContain("P-G-t3");
    expect(early.age).toBe(p.age); // source demographic, not a reconstructed historical age
    const current = snapshotPatient(p, "2026-10-13");
    expect(current.genomics).toEqual(p.genomics);
    expect(current.treatments.map(t => t.id)).toContain("P-G-t3");
  });

  it("preserves the known source-cutoff stage when completion details are incomplete", () => {
    const p = patient("P-1026");
    expect(p.stage).toBe("survivorship");
    expect(snapshotPatient(p, "2026-10-13").stage).toBe("survivorship");
  });

  it("keeps original cohort membership while rebuilding earlier clinical facts", () => {
    const c = createCohort("metastatic now", { stage: ["metastatic"] }, "x");
    submitCohort(c.id);
    const p = createSnapshot(c.id, "2020-01-01").patients.find(p => p.id === "P-L");
    expect(p).toBeDefined();
    expect(p!.stage).toBe("early_adjuvant");
    expect(c.patientIds).toContain("P-L");
  });
});

describe("research classification and quality regressions", () => {
  beforeEach(() => resetStore());

  it.each([
    { er: null, pr: 20, positive: true, negative: false, verdict: "met" },
    { er: 20, pr: null, positive: true, negative: false, verdict: "met" },
    { er: 0, pr: 0, positive: false, negative: true, verdict: "not_met" },
    { er: 0, pr: null, positive: false, negative: false, verdict: "unknown" },
    { er: null, pr: 0, positive: false, negative: false, verdict: "unknown" },
    { er: null, pr: null, positive: false, negative: false, verdict: "unknown" },
  ])("shares HR tri-state rules for ER=$er PR=$pr", ({ er, pr, positive, negative, verdict }) => {
    const p = patient();
    p.biomarkers = [{ ...p.biomarkers[0], erPct: er, prPct: pr }];
    expect(applyFilter([p], { hrPositive: true })).toHaveLength(positive ? 1 : 0);
    expect(applyFilter([p], { hrPositive: false })).toHaveLength(negative ? 1 : 0);
    expect(PROTOCOL_ADC_301[0].evaluate(p)).toBe(verdict);
  });

  it("includes lost metastatic patients and their unreviewed lines in quality", () => {
    const p = patient("P-B");
    p.stage = "lost";
    p.lines.forEach(l => { l.reviewStatus = "unreviewed"; l.reviewer = null; });
    const q = qualityMetrics([p]);
    expect(q.completeness.lines).toBe(1);
    expect(q.lineReviewRate).toBe(0);
  });

  it("counts missing lines for lost metastatic patients but treats nonmetastatic lines as inapplicable", () => {
    const p = patient("P-B");
    p.stage = "lost";
    p.lines = [];
    expect(qualityMetrics([p, patient("P-A")]).completeness.lines).toBe(0);
    expect(qualityMetrics([patient("P-A")]).completeness.lines).toBe(1);
    expect(qualityMetrics([patient("P-A")]).lineReviewRate).toBe(1);
  });

  it("shows actual unreviewed lines in the synthetic lost-ever-metastatic cohort", () => {
    const ps = applyFilter([...getStore().patients.values()], { stage: ["lost"], everMetastatic: true });
    const lines = ps.flatMap(p => p.lines);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every(l => l.reviewStatus === "unreviewed")).toBe(true);
    expect(qualityMetrics(ps).lineReviewRate).toBe(0);
  });
});

describe("direct candidate protocol contract", () => {
  beforeEach(() => resetStore());

  it("rejects unknown protocol ids without adding a candidate request", () => {
    const snapshot = createSnapshot(allCohort().id, "2026-10-13");
    expect(() => requestCandidates(snapshot.id, "OTHER-999")).toThrow("unsupported protocol");
    expect(getStore().candidateRequests).toHaveLength(0);
  });

  it("keeps repeated snapshot/protocol calls idempotent and research-consent bounded", () => {
    const snapshot = createSnapshot(allCohort().id, "2026-10-13");
    const first = requestCandidates(snapshot.id, "XX-ADC-301");
    expect(requestCandidates(snapshot.id, "XX-ADC-301")).toBe(first);
    expect(getStore().candidateRequests).toHaveLength(1);
    const eligible = new Set(snapshot.patients.filter(p => p.consent.research).map(p => p.id));
    const met = runFunnel(snapshot.patients, PROTOCOL_ADC_301).finalMet;
    expect(first.candidates.map(c => c.patientId)).toEqual(met.filter(id => eligible.has(id)));
  });
});
