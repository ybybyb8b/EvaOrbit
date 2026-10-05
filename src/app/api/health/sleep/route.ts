import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getDailySleepSummary } from "@/lib/services/sleep";
import { dateInEvaOrbit } from "@/lib/time";
import { dateOnly } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get("date");
    return NextResponse.json(await getDailySleepSummary(date ? dateOnly(date) : dateInEvaOrbit()), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
