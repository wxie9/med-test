import { NextResponse } from "next/server";
import { z } from "zod";
import { createSnapshot } from "@/lib/governance/snapshot";
import { getStore, snapshotSummary } from "@/lib/state/store";
import { DateOnly } from "@/lib/domain/dateSchema";
export const dynamic = "force-dynamic";
const Body = z.object({ cohortId: z.string().min(1), cutoff: DateOnly });
/** Creates an immutable research snapshot; the response omits the patient payload. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const { cohortId, cutoff } = parsed.data;
  if (!getStore().cohorts.some(c => c.id === cohortId)) return NextResponse.json({ error: "cohort not found" }, { status: 404 });
  try { return NextResponse.json(snapshotSummary(createSnapshot(cohortId, cutoff)), { status: 201 }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
}
