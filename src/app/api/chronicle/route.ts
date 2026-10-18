import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalLimit } from "@/lib/api";
import { createChronicleEntry, listChronicle } from "@/lib/services/chronicle";
import { parseNewChronicleEntry } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listChronicle({
      query: request.nextUrl.searchParams.get("q")?.trim() || undefined,
      limit: optionalLimit(request.nextUrl.searchParams.get("limit"), { trimEmpty: true }),
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createChronicleEntry(parseNewChronicleEntry(await request.json())), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
