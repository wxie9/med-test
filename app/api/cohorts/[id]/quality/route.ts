import { NextResponse } from "next/server";
import { qualityMetrics } from "@/lib/compute";
import { getStore } from "@/lib/state/store";
import type { Patient } from "@/lib/domain/types";
export const dynamic = "force-dynamic";
/** Quality metrics of a cohort's live patients, computed server-side so the governance page needs no patient data. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const s = getStore();
  const c = s.cohorts.find(x => x.id === id);
  if (!c) return NextResponse.json({ error: "cohort not found" }, { status: 404 });
  return NextResponse.json(qualityMetrics(c.patientIds.map(pid => s.patients.get(pid)).filter((p): p is Patient => !!p)));
}
