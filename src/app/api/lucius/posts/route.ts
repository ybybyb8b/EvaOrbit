import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalLimit } from "@/lib/api";
import { createLuciusPost, listLuciusPosts } from "@/lib/services/lucius";
import { parseNewLuciusPost } from "@/lib/validation";

export const runtime = "nodejs";


export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listLuciusPosts({ limit: optionalLimit(request.nextUrl.searchParams.get("limit"), { max: 100 }) })); }
  catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createLuciusPost(parseNewLuciusPost(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
