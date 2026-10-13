import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getLifeDayStart, updateLifeDayStart } from "@/lib/services/life-day";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json({ fallbackTime: await getLifeDayStart() }); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: NextRequest) {
  try { return NextResponse.json(await updateLifeDayStart((await request.json())?.fallbackTime)); }
  catch (error) { return apiError(error); }
}
