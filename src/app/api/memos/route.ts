import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createMemo, listMemos } from "@/lib/services/memo";
import type { MemoStatus, MemoType } from "@/lib/types";
import { parseNewMemo, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
const types: MemoType[] = ["basic", "supplement", "event", "note"];
const statuses: MemoStatus[] = ["active", "merged", "archived", "historical"];

function optionalEnum<T extends string>(value: string | null, values: T[], field: string) { if (!value) return undefined; if (!values.includes(value as T)) throw new ValidationError(`${field}格式不正确`); return value as T; }
function optionalLimit(value: string | null) { if (!value) return undefined; const limit = Number(value); if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new ValidationError("数量格式不正确"); return limit; }

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await listMemos({ query: request.nextUrl.searchParams.get("q")?.trim() || undefined, tag: request.nextUrl.searchParams.get("tag")?.trim() || undefined, type: optionalEnum(request.nextUrl.searchParams.get("type"), types, "Memo 类型"), status: optionalEnum(request.nextUrl.searchParams.get("status"), statuses, "Memo 状态"), limit: optionalLimit(request.nextUrl.searchParams.get("limit")) }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createMemo(parseNewMemo(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
