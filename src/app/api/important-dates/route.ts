import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listImportantDates, saveImportantDate } from "@/lib/services/important-dates";
export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await listImportantDates()); } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json(await saveImportantDate(null, await request.json()), { status: 201 }); } catch (error) { return apiError(error); }
}
