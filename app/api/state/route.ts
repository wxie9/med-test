import { NextResponse } from "next/server";
import { getStore, serialize } from "@/lib/state/store";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json(serialize(getStore())); }
