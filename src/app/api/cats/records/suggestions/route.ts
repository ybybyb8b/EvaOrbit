import { NextRequest, NextResponse } from "next/server";
import { apiError, parseId } from "@/lib/api";
import { getCatInputHistory } from "@/lib/services/cats";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const petId = parseId(request.nextUrl.searchParams.get("petId") ?? "");
    return NextResponse.json(await getCatInputHistory(petId));
  } catch (error) { return apiError(error); }
}
