import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createMemory, listMemories } from "@/lib/services/evaorbit";
import { parseNewMemory } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const category = request.nextUrl.searchParams.get("category")?.trim() ?? "";
  return NextResponse.json(await listMemories(query, category));
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createMemory(parseNewMemory(await request.json())), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
