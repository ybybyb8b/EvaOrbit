import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { completeTrainingPlan } from "@/lib/services/training";
import { parseTrainingPlanCompletion } from "@/lib/training-plan";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { return NextResponse.json(await completeTrainingPlan(parseTrainingPlanCompletion(await request.json()))); }
  catch (error) { return apiError(error); }
}
