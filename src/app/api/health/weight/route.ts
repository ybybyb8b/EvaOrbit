import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createWeightRecord, listWeightRecords } from "@/lib/services/weight";
import { parseNewWeightRecord } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const requested = Number(request.nextUrl.searchParams.get("limit") ?? 1000);
    return NextResponse.json(await listWeightRecords({ limit: Number.isSafeInteger(requested) ? requested : 1000 }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createWeightRecord(parseNewWeightRecord(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
