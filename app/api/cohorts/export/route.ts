import { NextResponse } from "next/server";
import { z } from "zod";
import { CohortFilter } from "@/lib/domain/types";
import { applyFilter } from "@/lib/compute";
import { cohortCsv } from "@/lib/clinic/cohortExport";
import { getStore } from "@/lib/state/store";
import { today } from "@/lib/state/clock";
export const dynamic = "force-dynamic";
const Body = z.object({ filter: CohortFilter });
/** CSV of the patients matching the current filter (same compute as /api/cohorts/preview, so data rows == preview count). */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const ps = applyFilter([...getStore().patients.values()], parsed.data.filter);
  return new Response("﻿" + cohortCsv(ps), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="cohort-${today()}.csv"`, "x-row-count": String(ps.length) },
  });
}
