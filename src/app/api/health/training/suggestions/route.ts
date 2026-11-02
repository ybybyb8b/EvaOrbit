import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getTrainingInputSuggestions, changeTrainingSuggestion } from "@/lib/services/training";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getTrainingInputSuggestions()); }
  catch (error) { return apiError(error); }
}
export async function PATCH(request: Request) {
  try { return NextResponse.json(await changeTrainingSuggestion(await request.json())); }
  catch (error) { return apiError(error); }
}
