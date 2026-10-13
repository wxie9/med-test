import { NextResponse } from "next/server";
import { z } from "zod";
import { completeTask } from "@/lib/clinic/actions";
export const dynamic = "force-dynamic";
const Body = z.object({ status: z.literal("done") });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  try { return NextResponse.json(completeTask(id)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 404 }); }
}
