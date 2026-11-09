import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalLimit, optionalEnum } from "@/lib/api";
import { createMemo, listMemos } from "@/lib/services/memo";
import { pageMemory } from "@/lib/services/memory-graph";
import type { MemoStatus, MemoType } from "@/lib/types";
import { parseNewMemo } from "@/lib/validation";

export const runtime = "nodejs";
const types: MemoType[] = ["basic", "supplement", "event", "note"];
const statuses: MemoStatus[] = ["active", "merged", "archived", "historical"];


export async function GET(request: NextRequest) {
  try {
    const input = { query: request.nextUrl.searchParams.get("q")?.trim() || undefined, tag: request.nextUrl.searchParams.get("tag")?.trim() || undefined, type: optionalEnum(request.nextUrl.searchParams.get("type"), types, "Memo 类型"), status: optionalEnum(request.nextUrl.searchParams.get("status"), statuses, "Memo 状态"), limit: optionalLimit(request.nextUrl.searchParams.get("limit")) };
    const params = request.nextUrl.searchParams;
    if (params.get("page") === "1" || params.has("cursor")) {
      return NextResponse.json(await pageMemory("memo", {
        ...input, cursor: params.get("cursor") ?? undefined, order: optionalEnum(params.get("order"), ["display", "created"], "排序"),
      }));
    }
    return NextResponse.json(await listMemos(input));
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createMemo(parseNewMemo(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
