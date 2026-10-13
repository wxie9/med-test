import { NextResponse, type NextRequest } from "next/server";
import { getStore, serialize, serializeLite } from "@/lib/state/store";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const s = getStore();
  return NextResponse.json(request.nextUrl.searchParams.get("include") === "patients" ? serialize(s) : serializeLite(s));
}
