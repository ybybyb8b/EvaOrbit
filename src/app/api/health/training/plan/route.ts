import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getTrainingPlan, saveTrainingPlan } from "@/lib/services/training";
import { parseTrainingPlanWrite } from "@/lib/training-plan";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getTrainingPlan()); }
  catch (error) { return apiError(error); }
}
export async function PUT(request: NextRequest) {
  try { return NextResponse.json(await saveTrainingPlan(parseTrainingPlanWrite(await request.json()))); }
  catch (error) { return apiError(error); }
}
