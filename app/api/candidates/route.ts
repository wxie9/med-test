import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/state/store";
import { requestCandidates, pharmaView, clinicView } from "@/lib/research/candidates";
export const dynamic = "force-dynamic";
const Body = z.object({ snapshotId: z.string().min(1), protocolId: z.literal("XX-ADC-301") });
/** Pharma side: request candidate verification for a snapshot; the response is counts only (never patient ids). */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const { snapshotId, protocolId } = parsed.data; const s = getStore();
  if (!s.snapshots.some(x => x.id === snapshotId)) return NextResponse.json({ error: "snapshot not found" }, { status: 404 });
  const existing = s.candidateRequests.find(r => r.snapshotId === snapshotId && r.protocolId === protocolId);
  if (existing) return NextResponse.json(pharmaView(existing), { status: 409 });
  return NextResponse.json(pharmaView(requestCandidates(snapshotId, protocolId)), { status: 201 });
}
/** Clinician side: full requests with patient ids plus per-candidate key-field summaries. */
export async function GET() {
  return NextResponse.json(getStore().candidateRequests.map(clinicView));
}
