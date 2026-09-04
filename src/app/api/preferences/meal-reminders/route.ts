import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { listMealReminderRules, updateMealReminderRules } from "@/lib/services/meal-reminder";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json(await listMealReminderRules()); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { rules?: unknown };
    return NextResponse.json(await updateMealReminderRules(body.rules));
  } catch (error) { return apiError(error); }
}
