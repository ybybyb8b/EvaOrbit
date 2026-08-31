import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createMediaSeries, listMediaSeries } from "@/lib/services/media";
import { parseMediaSeries } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try { return NextResponse.json(await listMediaSeries()); }
  catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createMediaSeries(parseMediaSeries(await request.json()).name), { status: 201 }); }
  catch (error) { return apiError(error); }
}
