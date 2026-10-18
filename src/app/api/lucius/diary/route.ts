import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalLimit } from "@/lib/api";
import { createLuciusDiaryEntry, listLuciusDiaryEntries } from "@/lib/services/lucius";
import { parseNewLuciusDiaryEntry } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listLuciusDiaryEntries({ query: request.nextUrl.searchParams.get("q")?.trim() || undefined, tag: request.nextUrl.searchParams.get("tag")?.trim() || undefined, limit: optionalLimit(request.nextUrl.searchParams.get("limit")) })); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createLuciusDiaryEntry(parseNewLuciusDiaryEntry(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
