import { NextResponse } from "next/server";
import { getStore, serializeResearch } from "@/lib/state/store";
import { now } from "@/lib/state/clock";
export const dynamic = "force-dynamic";
/** Research-portal poll: de-identified summaries only (see serializeResearch). */
export async function GET() {
  return NextResponse.json({ ...serializeResearch(getStore()), serverNow: now() });
}
