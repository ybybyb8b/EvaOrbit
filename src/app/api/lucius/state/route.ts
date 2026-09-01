import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getLuciusState, updateLuciusState } from "@/lib/services/lucius";
import { parseLuciusStatePatch } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json(await getLuciusState()); }
  catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest) {
  try { return NextResponse.json(await updateLuciusState(parseLuciusStatePatch(await request.json()))); }
  catch (error) { return apiError(error); }
}
