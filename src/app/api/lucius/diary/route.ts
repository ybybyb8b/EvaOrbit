import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createLuciusDiaryEntry, listLuciusDiaryEntries } from "@/lib/services/lucius";
import { parseNewLuciusDiaryEntry, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
function optionalLimit(value: string | null) { if (!value) return undefined; const limit = Number(value); if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new ValidationError("数量格式不正确"); return limit; }

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listLuciusDiaryEntries({ query: request.nextUrl.searchParams.get("q")?.trim() || undefined, tag: request.nextUrl.searchParams.get("tag")?.trim() || undefined, limit: optionalLimit(request.nextUrl.searchParams.get("limit")) })); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createLuciusDiaryEntry(parseNewLuciusDiaryEntry(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
