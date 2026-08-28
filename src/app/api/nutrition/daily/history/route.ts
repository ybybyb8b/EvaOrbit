import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listDailyNutritionHistory } from "@/lib/services/nutrition";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

function parseLimit(value: string | null) {
  if (value === null || value.trim() === "") return 30;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 90) throw new ValidationError("数量格式不正确");
  return limit;
}

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listDailyNutritionHistory(parseLimit(request.nextUrl.searchParams.get("limit"))));
  } catch (error) {
    return apiError(error);
  }
}
