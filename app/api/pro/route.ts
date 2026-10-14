import { NextResponse } from "next/server";
import { z } from "zod";
import { ProResponse } from "@/lib/domain/types";
import { getStore } from "@/lib/state/store";
import { submitPro } from "@/lib/pro/submit";
import { SCALE_SYMPTOMS } from "@/lib/pro/scales";
export const dynamic = "force-dynamic";
const Body = z.object({
  patientId: z.string().min(1),
  scaleId: ProResponse.shape.scaleId,
  items: z.record(z.number().int().min(0).max(3)),
  flags: z.object({ stopIntent: z.boolean().optional(), missedDoses14d: z.number().int().min(0).max(14).optional() }).strict(),
}).superRefine((body, ctx) => {
  const symptoms = SCALE_SYMPTOMS[body.scaleId];
  if (Object.keys(body.items).length !== symptoms.length || symptoms.some(s => !Object.hasOwn(body.items, s)))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "items must contain every symptom of the selected scale, and no unknown symptoms" });
  if (body.scaleId === "treatment_weekly_v1" && Object.keys(body.flags).length > 0)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["flags"], message: "weekly scale does not accept endocrine adherence flags" });
});
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body", issues: parsed.error.issues }, { status: 400 });
  if (!getStore().patients.has(parsed.data.patientId)) return NextResponse.json({ error: "patient not found" }, { status: 404 });
  return NextResponse.json(submitPro(parsed.data));
}
