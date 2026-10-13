import { NextResponse } from "next/server";
import { z } from "zod";
import { actOnAlert, closeAlertWithTask } from "@/lib/clinic/actions";
export const dynamic = "force-dynamic";
const Body = z.object({
  action: z.enum(["assign", "accept", "start", "submit_review", "close", "escalate"]),
  by: z.string().min(1),
  note: z.string().optional(),
  task: z.object({ type: z.string().min(1), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), owner: z.string().min(1) }).optional(),
});
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const { action, by, note, task } = parsed.data;
  try {
    if (action === "close" && task) return NextResponse.json(closeAlertWithTask(id, by, note ?? "", task));
    return NextResponse.json(actOnAlert(id, action, by, note));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
