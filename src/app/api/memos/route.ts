import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalLimit, optionalEnum } from "@/lib/api";
import { createMemo, listMemos } from "@/lib/services/memo";
import type { MemoStatus, MemoType } from "@/lib/types";
import { parseNewMemo } from "@/lib/validation";

export const runtime = "nodejs";
const types: MemoType[] = ["basic", "supplement", "event", "note"];
const statuses: MemoStatus[] = ["active", "merged", "archived", "historical"];


export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listMemos({ query: request.nextUrl.searchParams.get("q")?.trim() || undefined, tag: request.nextUrl.searchParams.get("tag")?.trim() || undefined, type: optionalEnum(request.nextUrl.searchParams.get("type"), types, "Memo 类型"), status: optionalEnum(request.nextUrl.searchParams.get("status"), statuses, "Memo 状态"), limit: optionalLimit(request.nextUrl.searchParams.get("limit")) }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createMemo(parseNewMemo(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
