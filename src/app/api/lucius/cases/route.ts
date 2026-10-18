import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalLimit, optionalEnum } from "@/lib/api";
import { createLuciusCase, listLuciusCases } from "@/lib/services/lucius";
import type { LuciusCaseErrorType, LuciusCaseSeverity, LuciusCaseStatus } from "@/lib/types";
import { parseNewLuciusCase } from "@/lib/validation";

export const runtime = "nodejs";
const errorTypes: LuciusCaseErrorType[] = ["naming", "memory_omission", "factual", "tool_misuse", "expression", "other"];
const severities: LuciusCaseSeverity[] = ["minor", "moderate", "serious", "habitual"];
const statuses: LuciusCaseStatus[] = ["serving", "probation", "temporary_release", "permanent_record"];

export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listLuciusCases({ query: request.nextUrl.searchParams.get("q")?.trim() || undefined, errorType: optionalEnum(request.nextUrl.searchParams.get("errorType"), errorTypes, "错误类型"), severity: optionalEnum(request.nextUrl.searchParams.get("severity"), severities, "严重程度"), status: optionalEnum(request.nextUrl.searchParams.get("status"), statuses, "案底状态"), currentOnly: request.nextUrl.searchParams.get("view") === "current", limit: optionalLimit(request.nextUrl.searchParams.get("limit")) })); }
  catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createLuciusCase(parseNewLuciusCase(await request.json())), { status: 201 }); }
  catch (error) { return apiError(error); }
}
