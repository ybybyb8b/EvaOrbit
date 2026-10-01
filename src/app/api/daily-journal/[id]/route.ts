import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { deleteDailyJournalEntry, updateDailyJournalEntry } from "@/lib/services/daily-journal";
import { parseDailyJournalEntryPatch } from "@/lib/validation";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const entry = await updateDailyJournalEntry(parseId((await params).id), parseDailyJournalEntryPatch(await request.json()));
    return entry ? NextResponse.json(entry) : NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: NextRequest, { params }: Context) {
  try {
    return await deleteDailyJournalEntry(parseId((await params).id))
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json({ error: "Journal entry not found" }, { status: 404 });
  } catch (error) {
    return apiError(error);
  }
}
