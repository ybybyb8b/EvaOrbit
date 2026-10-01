import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createDailyJournalEntry, listDailyJournalEntries } from "@/lib/services/daily-journal";
import { dateOnly, parseNewDailyJournalEntry } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const value = request.nextUrl.searchParams.get("date");
    return NextResponse.json(await listDailyJournalEntries({ date: value ? dateOnly(value) : undefined }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createDailyJournalEntry(parseNewDailyJournalEntry(await request.json())), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
