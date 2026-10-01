import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getHomeDayOverview } from "@/lib/services/home-day";
import { dateOnly } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const value = request.nextUrl.searchParams.get("date");
    return NextResponse.json(await getHomeDayOverview(value ? dateOnly(value) : undefined));
  } catch (error) {
    return apiError(error);
  }
}
