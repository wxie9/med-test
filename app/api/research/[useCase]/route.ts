import { NextResponse, type NextRequest } from "next/server";
import { isUseCase, researchUseCase, SnapshotNotFoundError } from "@/lib/research/usecases";
export const dynamic = "force-dynamic";
/** GET /api/research/:useCase?snapshotId=… — 400 unknown use case / missing snapshotId, 404 unknown snapshot. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ useCase: string }> }) {
  const { useCase } = await params;
  if (!isUseCase(useCase)) return NextResponse.json({ error: "unknown use case" }, { status: 400 });
  const snapshotId = request.nextUrl.searchParams.get("snapshotId");
  if (!snapshotId) return NextResponse.json({ error: "snapshotId required" }, { status: 400 });
  try { return NextResponse.json(researchUseCase(useCase, snapshotId)); }
  catch (e) {
    if (e instanceof SnapshotNotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
