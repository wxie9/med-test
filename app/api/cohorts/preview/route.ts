import { NextResponse } from "next/server";
import { z } from "zod";
import { CohortFilter } from "@/lib/domain/types";
import { applyFilter } from "@/lib/compute";
import { getStore } from "@/lib/state/store";
export const dynamic = "force-dynamic";
const Body = z.object({ filter: CohortFilter });
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  return NextResponse.json({ count: applyFilter([...getStore().patients.values()], parsed.data.filter).length });
}
