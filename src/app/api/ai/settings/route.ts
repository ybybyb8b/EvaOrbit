import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getAiSettings, updateAiSettings } from "@/lib/services/evaorbit";
import { publicAiSettings } from "@/lib/ai-provider";
import { parseAiSettings } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(publicAiSettings(await getAiSettings()));
}

export async function PUT(request: NextRequest) {
  try {
    const settings = await updateAiSettings(parseAiSettings(await request.json()));
    return NextResponse.json(publicAiSettings(settings));
  } catch (error) {
    return apiError(error);
  }
}
