import { NextRequest, NextResponse } from "next/server";
import { getTrainingPlan } from "@/lib/services/training";
import { apiError } from "@/lib/api";
import { isBilibiliVideoUrl, resolveTrainingVideo } from "@/lib/training-video";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    // Use the same authenticated account boundary as the plan API.
    await getTrainingPlan();
    const url = request.nextUrl.searchParams.get("url") ?? "";
    if (url.length > 1000 || !isBilibiliVideoUrl(url)) return NextResponse.json({ error: "Unsupported video link" }, { status: 400 });
    try { return NextResponse.json(await resolveTrainingVideo(url)); }
    catch { return NextResponse.json({ error: "Could not get video title" }, { status: 502 }); }
  } catch (error) { return apiError(error); }
}
