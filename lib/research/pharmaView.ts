import type { CandidateRequest } from "@/lib/domain/types";
/** Pharma-facing summary of a candidate request: counts only, never patient ids. Store-free so the store can use it. */
export function pharmaView(req: CandidateRequest) { return { id: req.id, snapshotId: req.snapshotId, protocolId: req.protocolId, total: req.candidates.length, confirmed: req.candidates.filter(c => c.status === "confirmed").length, createdAt: req.createdAt }; }
export type PharmaCandidateView = ReturnType<typeof pharmaView>;
