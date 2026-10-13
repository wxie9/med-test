import { NextResponse } from "next/server";
import { z } from "zod";
import { createTask } from "@/lib/clinic/actions";
export const dynamic = "force-dynamic";
const Body = z.object({ patientId: z.string().min(1), type: z.string().min(1), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), owner: z.string().min(1) });
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(createTask(parsed.data)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 }); }
}
