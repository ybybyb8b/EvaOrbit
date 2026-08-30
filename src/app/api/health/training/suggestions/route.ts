import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getTrainingInputSuggestions } from "@/lib/services/training";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getTrainingInputSuggestions()); }
  catch (error) { return apiError(error); }
}
