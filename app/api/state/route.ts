import { NextResponse, type NextRequest } from "next/server";
import { getStore, serialize, serializeLite } from "@/lib/state/store";
import { checkEscalations } from "@/lib/alerts/machine";
import { now } from "@/lib/state/clock";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const s = getStore(); const at = now();
  s.alerts = checkEscalations(s.alerts, at); // overdue unassigned alerts escalate on every poll
  const body = request.nextUrl.searchParams.get("include") === "patients" ? serialize(s) : serializeLite(s);
  return NextResponse.json({ ...body, serverNow: at }); // server clock (honours DEMO_FIXED_NOW) for client-side metrics/defaults
}
