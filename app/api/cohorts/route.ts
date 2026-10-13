import { NextResponse } from "next/server";
import { z } from "zod";
import { CohortFilter } from "@/lib/domain/types";
import { createCohort } from "@/lib/governance/snapshot";
export const dynamic = "force-dynamic";
const Body = z.object({ name: z.string().trim().min(1), filter: CohortFilter, by: z.string().min(1) });
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  const { name, filter, by } = parsed.data;
  return NextResponse.json(createCohort(name, filter, by), { status: 201 });
}
