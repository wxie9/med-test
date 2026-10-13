import { NextResponse } from "next/server";
import { z } from "zod";
import { ProResponse } from "@/lib/domain/types";
import { getStore } from "@/lib/state/store";
import { submitPro } from "@/lib/pro/submit";
export const dynamic = "force-dynamic";
const Body = z.object({
  patientId: z.string().min(1),
  scaleId: ProResponse.shape.scaleId,
  items: z.record(z.number().int().min(0).max(3)),
  flags: z.object({ stopIntent: z.boolean().optional(), missedDoses14d: z.number().int().min(0).optional() }),
});
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  if (!getStore().patients.has(parsed.data.patientId)) return NextResponse.json({ error: "patient not found" }, { status: 404 });
  return NextResponse.json(submitPro(parsed.data));
}
