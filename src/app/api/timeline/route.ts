import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getDailyTimelineOverview, getTimelineMonthSummary } from "@/lib/services/timeline";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

function requiredDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError("日期格式不正确");
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ValidationError("日期格式不正确");
  return value;
}

function requiredMonth(value: string | null) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) throw new ValidationError("月份格式不正确");
  const parsed = new Date(`${value}-01T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 7) !== value) throw new ValidationError("月份格式不正确");
  return value;
}

export async function GET(request: NextRequest) {
  try {
    const month = request.nextUrl.searchParams.get("month");
    if (month !== null) return NextResponse.json(await getTimelineMonthSummary(requiredMonth(month)));
    return NextResponse.json(await getDailyTimelineOverview(requiredDate(request.nextUrl.searchParams.get("date"))));
  } catch (error) {
    return apiError(error);
  }
}
