import { NextResponse } from "next/server";
import { getStore } from "@/lib/state/store";
import { today } from "@/lib/state/clock";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getStore(); const patient = s.patients.get(id);
  if (!patient) return NextResponse.json({ error: "patient not found" }, { status: 404 });
  return NextResponse.json({
    patient,
    alerts: s.alerts.filter(a => a.patientId === id),
    tasks: s.tasks.filter(t => t.patientId === id),
    messages: s.messages.filter(m => m.patientId === id),
    today: today(), // server clock (honours DEMO_FIXED_NOW) so patient pages agree with the server
  });
}
