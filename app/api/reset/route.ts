import { NextResponse } from "next/server";
import { resetStore } from "@/lib/state/store";
export async function POST() { resetStore(); return NextResponse.json({ ok: true }); }
