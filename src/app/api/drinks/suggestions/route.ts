import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getDrinkInputSuggestions } from "@/lib/services/drink";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getDrinkInputSuggestions()); }
  catch (error) { return apiError(error); }
}
