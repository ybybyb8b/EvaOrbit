import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createLuciusCase, listLuciusCases } from "@/lib/services/lucius";
import type { LuciusCaseErrorType, LuciusCaseSeverity, LuciusCaseStatus } from "@/lib/types";
import { parseNewLuciusCase, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";
const errorTypes: LuciusCaseErrorType[] = ["naming", "memory_omission", "factual", "tool_misuse", "expression", "other"];
const severities: LuciusCaseSeverity[] = ["minor", "moderate", "serious", "habitual"];
const statuses: LuciusCaseStatus[] = ["serving", "probation", "temporary_release", "permanent_record"];
function optionalEnum<T extends string>(value: string | null, values: T[], field: string) { if (!value) return undefined; if (!values.includes(value as T)) throw new ValidationError(`${field}格式不正确`); return value as T; }
function optionalLimit(value: string | null) { if (!value) return undefined; const limit = Number(value); if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new ValidationError("数量格式不正确"); return limit; }

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listLuciusCases({ query: request.nextUrl.searchParams.get("q")?.trim() || undefined, errorType: optionalEnum(request.nextUrl.searchParams.get("errorType"), errorTypes, "错误类型"), severity: optionalEnum(request.nextUrl.searchParams.get("severity"), severities, "严重程度"), status: optionalEnum(request.nextUrl.searchParams.get("status"), statuses, "案底状态"), currentOnly: request.nextUrl.searchParams.get("view") === "current", limit: optionalLimit(request.nextUrl.searchParams.get("limit")) })); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createLuciusCase(parseNewLuciusCase(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
