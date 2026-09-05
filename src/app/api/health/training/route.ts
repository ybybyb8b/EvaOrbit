import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createTrainingLog, listTrainingLogs } from "@/lib/services/training";
import { parseNewTrainingLog, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

function optionalDate(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ValidationError("训练日期格式不正确");
  return value;
}

function optionalMonth(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(`${value}-01T00:00:00Z`);
  if (!/^\d{4}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 7) !== value) throw new ValidationError("训练月份格式不正确");
  return value;
}

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listTrainingLogs({ date: optionalDate(request.nextUrl.searchParams.get("date")), month: optionalMonth(request.nextUrl.searchParams.get("month")), limit: 100 })); }
  catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createTrainingLog(parseNewTrainingLog(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
