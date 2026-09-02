import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createLuciusPost, listLuciusPosts } from "@/lib/services/lucius";
import { parseNewLuciusPost, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

function optionalLimit(value: string | null) {
  if (!value) return undefined;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ValidationError("数量格式不正确");
  return limit;
}

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listLuciusPosts({ limit: optionalLimit(request.nextUrl.searchParams.get("limit")) })); }
  catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createLuciusPost(parseNewLuciusPost(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
