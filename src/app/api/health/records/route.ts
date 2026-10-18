import { NextRequest, NextResponse } from "next/server";
import { apiError, optionalLimit, optionalEnum } from "@/lib/api";
import { createHealthRecord, listHealthRecords } from "@/lib/services/health";
import { parseNewHealthRecord, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

const recordTypes = ["symptom", "medication", "visit", "test", "condition", "treatment", "measurement", "note"] as const;
const recordStatuses = ["active", "resolved"] as const;

function optionalTimestamp(value: string | null, label: string) {
  if (value === null || value.trim() === "") return undefined;
  const date = new Date(value.trim());
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label}格式不正确`);
  return date.toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    return NextResponse.json(await listHealthRecords({
      status: optionalEnum(params.get("status"), recordStatuses, "健康记录状态"),
      type: optionalEnum(params.get("type"), recordTypes, "健康记录类型"),
      from: optionalTimestamp(params.get("from"), "起始时间"),
      to: optionalTimestamp(params.get("to"), "结束时间"),
      limit: optionalLimit(params.get("limit"), { max: 100 }),
    }));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createHealthRecord(parseNewHealthRecord(await request.json())), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
