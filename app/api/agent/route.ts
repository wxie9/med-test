import { NextResponse } from "next/server";
import { z } from "zod";
import { CohortFilter } from "@/lib/domain/types";
import { chat } from "@/lib/agents/adapter";
import { getStore } from "@/lib/state/store";
export const dynamic = "force-dynamic";
const Message = z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) });
const Body = z.object({
  agent: z.enum(["patient", "doctor", "research"]),
  messages: z.array(Message).min(1).max(40).refine(ms => ms[ms.length - 1]?.role === "user", "last message must be from the user"),
  context: z.object({ patientId: z.string().optional(), snapshotId: z.string().optional(), filter: CohortFilter.optional(), page: z.string().min(1) }),
});
/** One assistant turn; the resulting mode (incl. a degrade to deterministic) is written to the store for the ModeBadge. */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  try {
    const r = await chat(parsed.data);
    getStore().agentMode = r.mode;
    return NextResponse.json(r);
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 }); }
}
