import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { shiftDate, dateInEvaOrbit } from "@/lib/time";
import { getInsightDayReview } from "@/lib/services/insight-reports";
import { dateOnly, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try { const date=dateOnly(request.nextUrl.searchParams.get("date") ?? shiftDate(dateInEvaOrbit(), -1));
    if(date>=dateInEvaOrbit())throw new ValidationError("请选择已经结束的日期。");
    return NextResponse.json(await getInsightDayReview(date)); }
  catch (error) { return apiError(error); }
}
