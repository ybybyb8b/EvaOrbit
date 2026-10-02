import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getCalendarInterpretationOverview, saveCalendarInterpretation } from "@/lib/services/calendar-interpretation";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getCalendarInterpretationOverview()); }
  catch (error) { return apiError(error); }
}
export async function PUT(request: Request) {
  try {
    let value;
    try { value = await request.json(); } catch { throw new ValidationError("请求格式不正确"); }
    return NextResponse.json(await saveCalendarInterpretation(value));
  } catch (error) { return apiError(error); }
}
