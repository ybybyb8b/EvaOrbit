import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { createHealthRecord, listHealthRecords } from "@/lib/services/health";
import { parseNewHealthRecord, ValidationError } from "@/lib/validation";

export const runtime = "nodejs";

const recordTypes = ["symptom", "medication", "visit", "test", "condition", "treatment", "measurement", "note"] as const;
const recordStatuses = ["active", "resolved"] as const;

function optionalFilter<T extends string>(value: string | null, values: readonly T[], label: string) {
  if (value === null || value === "") return undefined;
  if (!values.includes(value as T)) throw new ValidationError(`${label}格式不正确`);
  return value as T;
}

function optionalLimit(value: string | null) {
  if (value === null || value === "") return undefined;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ValidationError("数量格式不正确");
  return limit;
}

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
      status: optionalFilter(params.get("status"), recordStatuses, "健康记录状态"),
      type: optionalFilter(params.get("type"), recordTypes, "健康记录类型"),
      from: optionalTimestamp(params.get("from"), "起始时间"),
      to: optionalTimestamp(params.get("to"), "结束时间"),
      limit: optionalLimit(params.get("limit")),
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
