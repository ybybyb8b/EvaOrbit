import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalLimit } from "@/lib/api";
import { listDailyNutritionHistory } from "@/lib/services/nutrition";

export const runtime = "nodejs";


export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listDailyNutritionHistory(optionalLimit(request.nextUrl.searchParams.get("limit"), { max: 90, trimEmpty: true }) ?? 30));
  } catch (error) {
    return apiError(error);
  }
}
