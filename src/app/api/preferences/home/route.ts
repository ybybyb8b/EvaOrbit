import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { normalizeHomeModuleOrder } from "@/lib/home-modules";
import { getUiPreferences, updateHomeModuleOrder } from "@/lib/services/evaorbit";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json(await getUiPreferences()); } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as { order?: unknown };
    if (!Array.isArray(body.order)) throw new ValidationError("Module order must be an array");
    return NextResponse.json(await updateHomeModuleOrder(normalizeHomeModuleOrder(body.order)));
  } catch (error) { return apiError(error); }
}
