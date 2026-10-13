import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/state/store";
import { recordAdherence } from "@/lib/adherence/checkin";
export const dynamic = "force-dynamic";
const Body = z.object({ patientId: z.string().min(1), taken: z.union([z.literal(0), z.literal(1)]), missedReason: z.string().max(100).optional() });
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  if (!getStore().patients.has(parsed.data.patientId)) return NextResponse.json({ error: "patient not found" }, { status: 404 });
  return NextResponse.json(recordAdherence(parsed.data));
}
