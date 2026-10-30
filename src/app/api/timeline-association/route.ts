import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getTimelineAssociationOverview, saveTimelineAssociation } from "@/lib/services/timeline-association";
import { ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getTimelineAssociationOverview(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
export async function PUT(request: Request) {
  try {
    let value;
    try { value = await request.json(); } catch { throw new ValidationError("请求格式不正确"); }
    return NextResponse.json(await saveTimelineAssociation(value), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
