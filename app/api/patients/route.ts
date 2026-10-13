import { NextResponse } from "next/server";
import { getStore } from "@/lib/state/store";
import { projectPatientList } from "@/lib/clinic/patientList";
export const dynamic = "force-dynamic";
/** Light patient list for the clinic table (never full patient objects). */
export async function GET() {
  const s = getStore();
  return NextResponse.json({ patients: projectPatientList([...s.patients.values()], s.alerts) });
}
