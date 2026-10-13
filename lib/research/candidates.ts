import { getStore } from "@/lib/state/store";
import { now, newId } from "@/lib/state/clock";
import { runFunnel, PROTOCOL_ADC_301 } from "@/lib/compute";
import { currentHer2 } from "@/lib/domain/her2";
import { HER2_LABEL } from "@/lib/clinic/labels";
import { SCALE_TITLES } from "@/lib/pro/scales";
import type { CandidateRequest, Patient } from "@/lib/domain/types";
/** Candidates = funnel finalMet of the snapshot; the pharma side only ever sees counts (pharmaView). */
export function requestCandidates(snapshotId: string, protocolId: string): CandidateRequest {
  const s = getStore(); const snap = s.snapshots.find(x => x.id === snapshotId); if (!snap) throw new Error("snapshot not found");
  const { finalMet } = runFunnel(snap.patients, PROTOCOL_ADC_301);
  const req: CandidateRequest = { id: newId("cand"), snapshotId, protocolId, candidates: finalMet.map(patientId => ({ patientId, status: "pending" as const })), createdAt: now() };
  s.candidateRequests.push(req); return req;
}
export { pharmaView, type PharmaCandidateView } from "./pharmaView";
export function confirmCandidate(requestId: string, patientId: string, status: "confirmed" | "rejected", by: string): CandidateRequest {
  const s = getStore(); const req = s.candidateRequests.find(r => r.id === requestId); if (!req) throw new Error("request not found");
  const c = req.candidates.find(x => x.patientId === patientId); if (!c) throw new Error("candidate not found");
  const wasConfirmed = c.status === "confirmed"; c.status = status;
  if (status === "confirmed" && !wasConfirmed) s.messages.push({ id: newId("msg"), patientId, kind: "research_opportunity", at: now(), text: `${by}认为有一项临床研究（${req.protocolId}）可能适合您，请在下次门诊时咨询或点击预约。` });
  return req;
}
/** Clinician-side key fields for one candidate, computed from the snapshot's patient copy. */
export function candidateSummary(p: Patient) {
  const line = p.lines.filter(l => l.end === null).sort((a, b) => b.lineNo - a.lineNo)[0];
  const drugs = line ? p.treatments.filter(t => line.eventIds.includes(t.id) && t.drug).map(t => t.drug as string) : [];
  const pro = [...p.pro].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
  return {
    patientId: p.id, her2: HER2_LABEL[currentHer2(p.biomarkers)],
    currentLine: line ? `第 ${line.lineNo} 线${drugs.length ? `（${drugs.join(" + ")}）` : ""}` : null,
    latestPro: pro ? `${pro.submittedAt.slice(0, 10)} · ${SCALE_TITLES[pro.scaleId]}` : null,
  };
}
export type CandidateSummary = ReturnType<typeof candidateSummary>;
/** Full request plus per-candidate summaries (clinician view only). */
export function clinicView(req: CandidateRequest) {
  const snap = getStore().snapshots.find(x => x.id === req.snapshotId);
  const byId = new Map((snap?.patients ?? []).map(p => [p.id, p]));
  const summaries = req.candidates.map(c => byId.get(c.patientId)).filter((p): p is Patient => !!p).map(candidateSummary);
  return { ...req, summaries };
}
export type ClinicCandidateRequest = ReturnType<typeof clinicView>;
