import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalLimit } from "@/lib/api";
import { createLuciusDiaryEntry, listLuciusDiaryEntries } from "@/lib/services/lucius";
import { dateOnly, parseNewLuciusDiaryEntry } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const date = params.get("date");
    return NextResponse.json(await listLuciusDiaryEntries({
      query: params.get("q")?.trim() || undefined,
      tag: params.get("tag")?.trim() || undefined,
      date: date ? dateOnly(date) : undefined,
      limit: optionalLimit(params.get("limit")),
    }));
  }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createLuciusDiaryEntry(parseNewLuciusDiaryEntry(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
