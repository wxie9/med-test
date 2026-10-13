import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmCandidate } from "@/lib/research/candidates";
export const dynamic = "force-dynamic";
const Body = z.object({ patientId: z.string().min(1), status: z.enum(["confirmed", "rejected"]), by: z.string().min(1) });
/** Clinician confirms/rejects one candidate; confirming sends the patient a research_opportunity message. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const { patientId, status, by } = parsed.data;
  try { return NextResponse.json(confirmCandidate(id, patientId, status, by)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 }); }
}
