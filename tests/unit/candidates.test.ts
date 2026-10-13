import { describe, it, expect, beforeEach } from "vitest";
import { createCohort, submitCohort, createSnapshot } from "@/lib/governance/snapshot";
import { requestCandidates, confirmCandidate, pharmaView } from "@/lib/research/candidates";
import { getStore, resetStore } from "@/lib/state/store";
import { runFunnel, PROTOCOL_ADC_301 } from "@/lib/compute";
describe("candidates", () => {
  beforeEach(() => resetStore());
  it("confirm sends research opportunity message to patient", () => {
    const c = createCohort("m", { stage: ["metastatic"], priorCdk46: true }, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    const req = requestCandidates(snap.id, "XX-ADC-301"); expect(req.candidates.length).toBeGreaterThan(0);
    const pid = req.candidates[0].patientId; confirmCandidate(req.id, pid, "confirmed", "张医生");
    expect(getStore().messages.some(m => m.patientId === pid && m.kind === "research_opportunity")).toBe(true);
  });
  it("research API response never includes patient ids", () => {
    const c = createCohort("m", { stage: ["metastatic"] }, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    // \b: the snapshot id "SNAP-2026-10-13-v1" would otherwise match /P-\d{4}/
    const req = requestCandidates(snap.id, "XX-ADC-301"); const { candidates, ...rest } = req; expect(JSON.stringify(rest)).not.toMatch(/\bP-\d{4}/);
    const json = JSON.stringify(pharmaView(req)); expect(json).not.toMatch(/\bP-\d{4}/); for (const c of candidates) expect(json).not.toContain(c.patientId);
    expect(pharmaView(req)).toEqual({ id: req.id, snapshotId: snap.id, protocolId: "XX-ADC-301", total: candidates.length, confirmed: 0, createdAt: req.createdAt });
  });
  it("pharmaView counts confirmations; rejection sends no message", () => {
    const c = createCohort("m", { stage: ["metastatic"], priorCdk46: true }, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    const req = requestCandidates(snap.id, "XX-ADC-301"); expect(req.candidates.length).toBeGreaterThan(1);
    const [a, b] = req.candidates.map(x => x.patientId);
    confirmCandidate(req.id, a, "confirmed", "张医生"); confirmCandidate(req.id, b, "rejected", "张医生");
    expect(pharmaView(req).confirmed).toBe(1);
    expect(getStore().messages.filter(m => m.patientId === b)).toHaveLength(0);
    expect(getStore().messages.find(m => m.patientId === a)?.text).toContain("可能适合您");
  });
  it("candidates = funnel finalMet ∩ research consent; pharma total counts only those", () => {
    const c = createCohort("m", { hrPositive: true, everMetastatic: true, priorCdk46: true }, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    const { finalMet } = runFunnel(snap.patients, PROTOCOL_ADC_301);
    const byId = new Map(snap.patients.map(p => [p.id, p]));
    const req = requestCandidates(snap.id, "XX-ADC-301"); const ids = req.candidates.map(x => x.patientId);
    expect(ids).toEqual(finalMet.filter(id => byId.get(id)!.consent.research));
    expect(ids.every(id => byId.get(id)!.consent.research)).toBe(true);
    expect(pharmaView(req).total).toBe(ids.length);
    // a met patient without research consent is excluded
    const live = getStore().patients.get(ids[0])!; live.consent.research = false;
    const c2 = createCohort("m2", { hrPositive: true, everMetastatic: true, priorCdk46: true }, "x"); submitCohort(c2.id); const snap2 = createSnapshot(c2.id, "2026-10-13");
    expect(runFunnel(snap2.patients, PROTOCOL_ADC_301).finalMet).toContain(ids[0]);
    expect(requestCandidates(snap2.id, "XX-ADC-301").candidates.map(x => x.patientId)).not.toContain(ids[0]);
  });
  it("throws on unknown snapshot, request or candidate", () => {
    expect(() => requestCandidates("nope", "XX-ADC-301")).toThrow("snapshot not found");
    expect(() => confirmCandidate("nope", "P-0001", "confirmed", "x")).toThrow("request not found");
    const c = createCohort("m", { stage: ["metastatic"] }, "x"); submitCohort(c.id); const snap = createSnapshot(c.id, "2026-10-13");
    const req = requestCandidates(snap.id, "XX-ADC-301");
    expect(() => confirmCandidate(req.id, "P-NOPE", "confirmed", "x")).toThrow("candidate not found");
  });
});
