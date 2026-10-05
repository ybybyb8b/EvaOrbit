import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { parseEventKitPreferences } from "@/lib/eventkit-preferences";
import { getEventKitPreferences, saveEventKitPreferences } from "@/lib/services/eventkit-preferences";
import { ValidationError } from "@/lib/validation";
export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getEventKitPreferences(), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); }
}
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || !Number.isSafeInteger(body.revision) || body.revision < 0) throw new ValidationError("同步偏好版本不正确");
    return NextResponse.json(await saveEventKitPreferences(parseEventKitPreferences(body.preferences), body.revision));
  } catch (error) { return apiError(error); }
}
