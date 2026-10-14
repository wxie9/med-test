import { NextResponse } from "next/server";
import { getStore } from "@/lib/state/store";
import { submitPro } from "@/lib/pro/submit";
import { ProBody } from "@/lib/pro/validation";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const parsed = ProBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  if (!getStore().patients.has(parsed.data.patientId)) return NextResponse.json({ error: "patient not found" }, { status: 404 });
  return NextResponse.json(submitPro(parsed.data));
}
